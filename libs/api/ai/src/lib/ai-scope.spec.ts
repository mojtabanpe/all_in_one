import { ConfigService } from '@nestjs/config';
import type { AiGateway } from './ai-gateway.service';
import type { AiScopeTarget, AiSettingsService } from './ai-settings.service';
import { type LocalScopeClassifier, vote } from './scope-classifier';
import {
  AI_SCOPE_INSTRUCTIONS,
  AiScopeGuard,
  JEV_SCOPE_QUESTION,
  jevProbability,
} from './ai-scope';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('undici', async (original) => ({
  ...(await original<typeof import('undici')>()),
  fetch: fetchMock,
}));

const target = (change: Partial<AiScopeTarget> = {}): AiScopeTarget => ({
  on: true,
  provider: 'chat',
  model: '',
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  key: null,
  proxy: null,
  ...change,
});

function setup(
  reply: string | null,
  scope = target(),
  local: number | null = null,
) {
  const chat = vi.fn().mockResolvedValue({ content: reply, toolCalls: [] });
  const probability = vi.fn().mockResolvedValue(local);
  const guard = new AiScopeGuard(
    { chat } as unknown as AiGateway,
    {
      scopeTarget: vi.fn().mockResolvedValue(scope),
    } as unknown as AiSettingsService,
    new ConfigService({}),
    { probability } as unknown as LocalScopeClassifier,
  );
  return { chat, guard, probability };
}

const jevReply = (noul: number, status = 200) =>
  new Response(
    JSON.stringify({
      model: 'jev-1.13.0',
      answers: { in_scope: { type: 'noul', noul } },
    }),
    { status },
  );

describe('AiScopeGuard', () => {
  beforeEach(() => fetchMock.mockReset());

  it('decides with the local model without calling anything outside', async () => {
    const out = setup(null, target({ provider: 'local' }), 0.12);
    await expect(
      out.guard.decide('u1', 'یک کد پایتون بنویس', 'assistant'),
    ).resolves.toEqual({
      inScope: false,
      probability: 0.12,
      provider: 'local',
    });
    expect(out.probability).toHaveBeenCalledWith('یک کد پایتون بنویس');
    expect(out.chat).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const borderline = setup(null, target({ provider: 'local' }), 0.31);
    await expect(
      borderline.guard.inScope('u1', 'باشه', 'assistant'),
    ).resolves.toBe(true);
    // A model that cannot load never blocks anyone.
    const broken = setup(null, target({ provider: 'local' }), null);
    await expect(broken.guard.inScope('u1', 'x', 'assistant')).resolves.toBe(
      true,
    );
  });

  it('votes by the nearest labelled examples, closer ones counting more', () => {
    const v = (...xs: number[]) => Float32Array.from(xs);
    const examples = [
      { inScope: true, vector: v(1, 0) },
      { inScope: false, vector: v(0, 1) },
      { inScope: false, vector: v(0.1, 0.995) },
    ];
    expect(vote(v(0.99, 0.14), examples)).toBeGreaterThan(0.9);
    expect(vote(v(0.1, 0.995), examples)).toBeLessThan(0.1);
  });

  it('asks Jev one yes/no question and refuses a low probability', async () => {
    const { chat, guard } = setup(null, target({ provider: 'jev', key: 'k1' }));
    fetchMock.mockResolvedValueOnce(jevReply(0.08));
    await expect(
      guard.decide('u1', 'write a python web scraper', 'assistant'),
    ).resolves.toEqual({ inScope: false, probability: 0.08, provider: 'jev' });
    expect(chat).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.headers.Authorization).toBe('Bearer k1');
    expect(JSON.parse(init.body)).toEqual({
      model: 'jev-latest',
      state: { area: 'assistant', request: 'write a python web scraper' },
      questions: { in_scope: JEV_SCOPE_QUESTION },
    });

    fetchMock.mockResolvedValueOnce(jevReply(0.4));
    await expect(
      guard.inScope('u1', 'برای فردا برنامه بچین', 'assistant'),
    ).resolves.toBe(true);
  });

  it('lets requests through when Jev has no key, fails or answers oddly', async () => {
    const noKey = setup(null, target({ provider: 'jev' }));
    await expect(noKey.guard.inScope('u1', 'x', 'assistant')).resolves.toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const { guard } = setup(null, target({ provider: 'jev', key: 'k1' }));
    fetchMock.mockResolvedValueOnce(jevReply(0, 529));
    await expect(guard.inScope('u1', 'x', 'assistant')).resolves.toBe(true);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(guard.inScope('u1', 'x', 'assistant')).resolves.toBe(true);
    expect(jevProbability({ answers: { in_scope: { noul: 7 } } })).toBeNull();
  });

  it('uses the chat model as the judge when chosen', async () => {
    const { chat, guard } = setup('```json\n{"in_scope": false}\n```', {
      ...target({ model: 'small-model' }),
    });
    await expect(
      guard.assert('u1', 'solve this integral', 'english'),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'AI_OUT_OF_SCOPE' },
    });
    const [, messages, options] = chat.mock.calls[0];
    expect(messages[0]).toEqual({
      role: 'system',
      content: AI_SCOPE_INSTRUCTIONS,
    });
    expect(options).toMatchObject({ temperature: 0, model: 'small-model' });
  });

  it('skips the check when switched off or empty', async () => {
    const off = setup('{"in_scope": false}', target({ on: false }));
    await expect(
      off.guard.inScope('u1', 'anything', 'assistant'),
    ).resolves.toBe(true);
    await expect(off.guard.inScope('u1', '   ', 'assistant')).resolves.toBe(
      true,
    );
    expect(off.chat).not.toHaveBeenCalled();
    const vague = setup('Sure! Here is a poem…');
    await expect(vague.guard.inScope('u1', 'hi', 'assistant')).resolves.toBe(
      true,
    );
  });
});
