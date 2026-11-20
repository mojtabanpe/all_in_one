import {
  AI_OUT_OF_SCOPE_EN,
  AI_OUT_OF_SCOPE_FA,
  type AiGateway,
  type AiScopeGuard,
} from '@all-in-one/api/ai';
import type { PrismaService } from '@all-in-one/api/db';
import type { EnglishAiService } from '@all-in-one/applets/english-learning/api';
import type { AssistantRequest } from '@all-in-one/shared/schemas';
import type { ToolSink } from '../tools/tool-kit';
import type { ToolsService } from '../tools/tools.service';
import { AssistantService } from './assistant.service';

function setup() {
  // Reproduce the live classifier: the lunch request passes alone, but a refusal prepended to it fails.
  const inScope = vi.fn(async (_userId: string, text: string) => {
    return (
      !text.includes(AI_OUT_OF_SCOPE_FA) &&
      !text.includes(AI_OUT_OF_SCOPE_EN) &&
      !text.includes('Write Python code')
    );
  });
  const chat = vi.fn().mockResolvedValue({ content: 'Saved.', toolCalls: [] });
  const register = vi.fn();
  const service = new AssistantService(
    { chat } as unknown as AiGateway,
    { register } as unknown as ToolsService,
    {
      user: { findUnique: vi.fn().mockResolvedValue({ name: null }) },
    } as unknown as PrismaService,
    {
      presentInEnglish: vi.fn(async (_userId: string, text: string) => text),
    } as unknown as EnglishAiService,
    { inScope } as unknown as AiScopeGuard,
  );
  return { service, inScope, chat, register };
}

describe('assistant scope refusal recovery', () => {
  const lunch = 'ناهار امروز خورشت بادمجون خوردم ثبت کن';

  it.each([AI_OUT_OF_SCOPE_FA, AI_OUT_OF_SCOPE_EN])(
    'allows a meal request after a scope refusal: %s',
    async (refusal) => {
      const { service, inScope, chat } = setup();
      const result = await service.chat('owner', {
        messages: [
          { role: 'user', content: 'Write Python code' },
          { role: 'assistant', content: ` ${refusal}\n` },
          { role: 'user', content: lunch },
        ],
      });
      expect(inScope).toHaveBeenCalledWith('owner', lunch, 'assistant');
      expect(chat).toHaveBeenCalledOnce();
      expect(result.reply).toBe('Saved.');
    },
  );

  it('keeps ordinary replies as context for short follow-ups', async () => {
    const { service, inScope } = setup();
    await service.chat('owner', {
      messages: [
        { role: 'assistant', content: 'Should I log this as lunch?' },
        { role: 'user', content: 'Yes, do that' },
      ],
    });
    expect(inScope).toHaveBeenCalledWith(
      'owner',
      '(Previous assistant reply, for context: Should I log this as lunch?)\nYes, do that',
      'assistant',
    );
  });

  it('checks a standalone request without adding context', async () => {
    const { service, inScope } = setup();
    await service.chat('owner', {
      messages: [{ role: 'user', content: lunch }],
    });
    expect(inScope).toHaveBeenCalledWith('owner', lunch, 'assistant');
  });

  it.each(['fa', 'en'] as const)(
    'still refuses off-topic requests after a refusal (%s)',
    async (language: AssistantRequest['language']) => {
      const { service, inScope, chat, register } = setup();
      const refusal =
        language === 'en' ? AI_OUT_OF_SCOPE_EN : AI_OUT_OF_SCOPE_FA;
      const result = await service.chat('owner', {
        language,
        messages: [
          { role: 'assistant', content: refusal },
          { role: 'user', content: 'Write Python code' },
        ],
      });
      expect(inScope).toHaveBeenCalledWith(
        'owner',
        'Write Python code',
        'assistant',
      );
      expect(chat).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
      expect(result).toEqual({ reply: refusal, actions: [], changed: false });
    },
  );
});

describe('assistant tool sections', () => {
  function withTools() {
    const ctx = setup();
    ctx.register.mockImplementation((sink: ToolSink) => {
      for (const [name, scope] of [
        ['create_task', 'planner:write'],
        ['log_meal', 'health:write'],
        ['create_card', 'cards:write'],
        ['create_expense', 'expenses:write'],
      ] as const)
        sink.tool(
          name,
          { description: name, scope, kind: 'create', input: {} },
          async () => ({ ok: true }),
        );
    });
    return ctx;
  }
  const sent = (chat: ReturnType<typeof vi.fn>, call = 0) =>
    (
      chat.mock.calls[call][2] as { tools: { function: { name: string } }[] }
    ).tools.map((t) => t.function.name);

  it('sends the screen section and the sections the message mentions', async () => {
    const { service, chat } = withTools();
    await service.chat('owner', {
      context: 'planner',
      messages: [{ role: 'user', content: 'ناهار کباب خوردم' }],
    });
    expect(sent(chat)).toEqual(['create_task', 'log_meal', 'load_tools']);
  });

  it('sends every section on home when nothing matches', async () => {
    const { service, chat } = withTools();
    await service.chat('owner', {
      messages: [{ role: 'user', content: 'سلام' }],
    });
    expect(sent(chat)).toEqual([
      'create_task',
      'log_meal',
      'create_card',
      'create_expense',
    ]);
  });

  it('keeps the sections the previous reply used', async () => {
    const { service, chat } = withTools();
    await service.chat('owner', {
      context: 'planner',
      messages: [
        {
          role: 'assistant',
          content: 'ثبت شد',
          log: 'create_expense {"amount":5} → ok',
        },
        { role: 'user', content: 'همونو پاک کن' },
      ],
    });
    expect(sent(chat)).toEqual(['create_task', 'create_expense', 'load_tools']);
  });

  it('loads another section when the model asks for it', async () => {
    const { service, chat } = withTools();
    chat
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: {
              name: 'load_tools',
              arguments: '{"sections":["english"]}',
            },
          },
        ],
      })
      .mockResolvedValueOnce({ content: 'Done.', toolCalls: [] });
    const result = await service.chat('owner', {
      context: 'planner',
      messages: [{ role: 'user', content: 'یه چیزی اضافه کن' }],
    });
    expect(sent(chat, 1)).toEqual(['create_task', 'create_card', 'load_tools']);
    expect(result.actions).toEqual([]);
  });
});
