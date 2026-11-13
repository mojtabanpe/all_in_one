import {
  AI_OUT_OF_SCOPE_EN,
  AI_OUT_OF_SCOPE_FA,
  type AiGateway,
  type AiScopeGuard,
} from '@all-in-one/api/ai';
import type { PrismaService } from '@all-in-one/api/db';
import type { EnglishAiService } from '@all-in-one/applets/english-learning/api';
import type { AssistantRequest } from '@all-in-one/shared/schemas';
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
