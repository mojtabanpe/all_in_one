import type { AiGateway } from './ai-gateway.service';
import type { AiSettingsService } from './ai-settings.service';
import { AI_SCOPE_INSTRUCTIONS, AiScopeGuard } from './ai-scope';

function setup(reply: string | null, scope = { on: true, model: '' }) {
  const chat = vi.fn().mockResolvedValue({ content: reply, toolCalls: [] });
  const guard = new AiScopeGuard(
    { chat } as unknown as AiGateway,
    { scope: vi.fn().mockResolvedValue(scope) } as unknown as AiSettingsService,
  );
  return { chat, guard };
}

describe('AiScopeGuard', () => {
  it('asks the decision model with its own model and no creativity', async () => {
    const { chat, guard } = setup('{"in_scope": true}', {
      on: true,
      model: 'small-model',
    });
    await expect(
      guard.inScope('u1', 'برای فردا یه برنامه بچین', 'assistant'),
    ).resolves.toBe(true);
    const [user, messages, options] = chat.mock.calls[0];
    expect(user).toBe('u1');
    expect(messages[0]).toEqual({
      role: 'system',
      content: AI_SCOPE_INSTRUCTIONS,
    });
    expect(messages[1].content).toContain('برای فردا یه برنامه بچین');
    expect(options).toMatchObject({ temperature: 0, model: 'small-model' });
  });

  it('refuses an out-of-scope request with a 422 the app can show', async () => {
    const { guard } = setup('```json\n{"in_scope": false}\n```');
    await expect(
      guard.assert('u1', 'write a python web scraper', 'english'),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'AI_OUT_OF_SCOPE' },
    });
  });

  it('skips the call when switched off or empty, and lets an unreadable verdict through', async () => {
    const off = setup('{"in_scope": false}', { on: false, model: '' });
    await expect(
      off.guard.inScope('u1', 'anything', 'assistant'),
    ).resolves.toBe(true);
    expect(off.chat).not.toHaveBeenCalled();

    const empty = setup('{"in_scope": false}');
    await expect(empty.guard.inScope('u1', '   ', 'assistant')).resolves.toBe(
      true,
    );
    expect(empty.chat).not.toHaveBeenCalled();

    const vague = setup('Sure! Here is a poem…');
    await expect(vague.guard.inScope('u1', 'hi', 'assistant')).resolves.toBe(
      true,
    );
  });

  it('keeps the model on the chat model when none is set', async () => {
    const { chat, guard } = setup('{"in_scope": true}');
    await guard.inScope('u1', 'calories in rice', 'assistant');
    expect(chat.mock.calls[0][2].model).toBeUndefined();
  });
});
