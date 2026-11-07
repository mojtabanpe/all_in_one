import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import { AI_USER_CONCURRENCY } from '@all-in-one/shared/schemas';
import { AiGateway, shouldFallBack } from './ai-gateway.service';
import { AiHealthService } from './ai-health.service';
import { AiSettingsService, type AiTarget } from './ai-settings.service';
import { SecretBox } from './secret-box';

const SECRET = 'r'.repeat(40);
const primaryRow = {
  chatUrl: 'https://main.example/v1',
  chatModel: 'main-chat',
  ttsUrl: 'https://main.example/v1',
  ttsModel: 'main-voice',
  ttsModel2: 'main-voice-2',
  sttUrl: 'https://main.example/v1',
  sttModel: 'main-stt',
};

const fallbacks: Record<string, AiTarget | null> = {
  chat: {
    endpoint: 'https://backup.example/v1/chat/completions',
    model: 'backup-chat',
    key: 'backup-key',
    proxy: null,
    provider: 'openai',
  },
  tts: {
    endpoint: 'https://api.elevenlabs.io',
    model: 'backup-voice',
    key: 'eleven-key',
    proxy: null,
    provider: 'elevenlabs',
  },
  stt: {
    endpoint: 'https://api.deepgram.com',
    model: 'nova-3',
    key: 'dg-key',
    proxy: null,
    provider: 'deepgram',
  },
};

const chatReply = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
const audioReply = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': 'audio/mpeg' },
  });

function setup(options: { fallback?: boolean } = {}) {
  const config = new ConfigService({ JWT_SECRET: SECRET });
  const prisma = {
    managedAiConfiguration: {
      findUnique: vi.fn().mockResolvedValue({ settings: primaryRow }),
    },
  } as unknown as PrismaService;
  const settings = new AiSettingsService(config, prisma);
  vi.spyOn(settings, 'fallbackTarget').mockImplementation(async (kind) =>
    options.fallback === false ? null : fallbacks[kind],
  );
  vi.spyOn(settings, 'fallbackVoice2').mockResolvedValue('backup-voice-2');
  const health = new AiHealthService();
  const gateway = new AiGateway(
    settings,
    config,
    { access: vi.fn().mockResolvedValue({ tier: 'paid' }) },
    undefined,
    health,
  );
  const request = vi.spyOn(gateway as never, 'request' as never);
  return {
    gateway,
    health,
    request: request as unknown as ReturnType<
      typeof vi.fn<(target: AiTarget, init: { body: unknown }) => unknown>
    >,
  };
}

const report = (health: AiHealthService) =>
  health.report({ todayUsd: 0, dailyBudgetUsd: 0 });

describe('AI fallback', () => {
  it('falls back on outages, rate limits and a refused setup, not on bad input', () => {
    expect([408, 429, 500, 503, 401, 402, 403, 404].every(shouldFallBack)).toBe(
      true,
    );
    expect([400, 413, 415, 422].some(shouldFallBack)).toBe(false);
  });

  it('answers chat from the fallback with its own model when the main service fails', async () => {
    const { gateway, health, request } = setup();
    request
      .mockResolvedValueOnce(new Response('busy', { status: 503 }) as never)
      .mockResolvedValueOnce(chatReply() as never);
    const reply = await gateway.chat('user', [], { model: 'scope-model' });
    expect(reply.content).toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    const [first, second] = request.mock.calls;
    expect(JSON.parse(first[1].body as string).model).toBe('scope-model');
    expect(second[0]).toBe(fallbacks['chat']);
    expect(JSON.parse(second[1].body as string).model).toBe('backup-chat');
    expect(report(health).hour.chat).toEqual({
      calls: 1,
      failed: 0,
      fellBack: 1,
    });
  });

  it('does not fall back on a request error and reports it as failed', async () => {
    const { gateway, health, request } = setup();
    request.mockResolvedValueOnce(
      new Response('bad', { status: 400 }) as never,
    );
    await expect(gateway.chat('user', [])).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(report(health).hour.chat).toEqual({
      calls: 1,
      failed: 1,
      fellBack: 0,
    });
    expect(report(health).lastError.chat?.message).toBe('HTTP 400');
  });

  it('fails as before when the main service is down and no fallback is chosen', async () => {
    const { gateway, health, request } = setup({ fallback: false });
    request.mockRejectedValueOnce(new BadGatewayException('down') as never);
    await expect(gateway.chat('user', [])).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(report(health).hour.chat.failed).toBe(1);
  });

  it('speaks the second voice through an ElevenLabs fallback', async () => {
    const { gateway, request } = setup();
    request
      .mockResolvedValueOnce(new Response('', { status: 401 }) as never)
      .mockResolvedValueOnce(audioReply() as never);
    const { contentType } = await gateway.speech('user', 'Hi', 'secondary');
    expect(contentType).toBe('audio/mpeg');
    expect(request.mock.calls[0][0].model).toBe('main-voice-2');
    expect(request.mock.calls[1][0]).toMatchObject({
      provider: 'elevenlabs',
      endpoint:
        'https://api.elevenlabs.io/v1/text-to-speech/backup-voice-2?output_format=mp3_44100_128',
    });
  });

  it('transcribes through a Deepgram fallback when the main service is unreachable', async () => {
    const { gateway, request } = setup();
    request
      .mockRejectedValueOnce(new BadGatewayException('down') as never)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: {
              channels: [{ alternatives: [{ transcript: 'hello' }] }],
            },
          }),
        ) as never,
      );
    expect(
      await gateway.transcribe('user', Buffer.alloc(10), 'audio/webm'),
    ).toBe('hello');
    expect(request.mock.calls[1][0].endpoint).toContain(
      'https://api.deepgram.com/v1/listen?model=nova-3',
    );
  });

  it('tests only the main service and records nothing', async () => {
    const { gateway, health, request } = setup();
    request.mockResolvedValueOnce(
      new Response('busy', { status: 503 }) as never,
    );
    expect((await gateway.testManaged('chat')).ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(report(health).hour.chat.calls).toBe(0);
  });
});

describe('AI concurrency per account', () => {
  it(`refuses a request beyond ${AI_USER_CONCURRENCY} at once and frees slots when they finish`, async () => {
    const { gateway, request } = setup();
    const release: (() => void)[] = [];
    request.mockImplementation(
      () =>
        new Promise((resolve) =>
          release.push(() => resolve(chatReply())),
        ) as never,
    );
    const running = Array.from({ length: AI_USER_CONCURRENCY }, () =>
      gateway.chat('busy-user', []),
    );
    await vi.waitFor(() => expect(release).toHaveLength(AI_USER_CONCURRENCY));
    await expect(gateway.chat('busy-user', [])).rejects.toMatchObject({
      status: 429,
    });
    // Another account is not affected.
    const other = gateway.chat('other-user', []);
    await vi.waitFor(() =>
      expect(release).toHaveLength(AI_USER_CONCURRENCY + 1),
    );
    release.forEach((done) => done());
    await Promise.all([...running, other]);
    request.mockResolvedValueOnce(chatReply() as never);
    await expect(gateway.chat('busy-user', [])).resolves.toMatchObject({
      content: 'ok',
    });
  });

  it('frees the slot when a request fails', async () => {
    const { gateway, request } = setup({ fallback: false });
    request.mockRejectedValue(new BadGatewayException('down') as never);
    for (let i = 0; i < AI_USER_CONCURRENCY + 2; i++)
      await expect(gateway.chat('user', [])).rejects.toBeInstanceOf(
        BadGatewayException,
      );
  });
});

describe('AI health alerts', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');

  it('alerts on a failing service, heavy fallback use and the daily budget', () => {
    const health = new AiHealthService();
    for (let i = 0; i < 4; i++)
      health.record('chat', { ok: true, fellBack: false }, now - 60_000);
    health.record(
      'chat',
      { ok: false, fellBack: false, error: 'HTTP 503' },
      now - 60_000,
    );
    for (let i = 0; i < 3; i++)
      health.record('tts', { ok: true, fellBack: true }, now - 60_000);
    // Two hours ago: counted for the day, not the hour.
    for (let i = 0; i < 10; i++)
      health.record('stt', { ok: false, fellBack: false }, now - 7_200_000);
    const quiet = health.report({ todayUsd: 3, dailyBudgetUsd: 10 }, now);
    expect(quiet.alerts).toEqual([
      { kind: 'errors', service: 'chat', failed: 1, calls: 5 },
      { kind: 'fallback', service: 'tts', fellBack: 3 },
    ]);
    expect(quiet.day.stt).toEqual({ calls: 10, failed: 10, fellBack: 0 });
    expect(quiet.hour.stt.calls).toBe(0);
    expect(
      health.report({ todayUsd: 8.5, dailyBudgetUsd: 10 }, now).alerts.at(-1),
    ).toEqual({ kind: 'budget-near', todayUsd: 8.5, budgetUsd: 10 });
    expect(
      health.report({ todayUsd: 12, dailyBudgetUsd: 10 }, now).alerts.at(-1),
    ).toEqual({ kind: 'budget', todayUsd: 12, budgetUsd: 10 });
    expect(
      health
        .report({ todayUsd: 12, dailyBudgetUsd: 0 }, now)
        .alerts.some((alert) => alert.kind.startsWith('budget')),
    ).toBe(false);
  });

  it('forgets events and errors older than a day', () => {
    const health = new AiHealthService();
    health.record(
      'chat',
      { ok: false, fellBack: false, error: 'HTTP 500' },
      now - 25 * 3_600_000,
    );
    health.record('chat', { ok: true, fellBack: false }, now);
    const result = health.report({ todayUsd: 0, dailyBudgetUsd: 0 }, now);
    expect(result.day.chat.calls).toBe(1);
    expect(result.lastError.chat).toBeNull();
  });
});

describe('fallback settings', () => {
  const box = new SecretBox(SECRET);
  function settingsWith(stored: object, presets: object[]) {
    const prisma = {
      managedAiConfiguration: {
        findUnique: vi.fn().mockResolvedValue({ settings: stored }),
      },
      managedAiPreset: {
        findMany: vi.fn(
          async ({ where }: { where: { id?: { in: string[] } } }) =>
            presets.filter((p) =>
              where.id ? where.id.in.includes((p as { id: string }).id) : true,
            ),
        ),
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) =>
            presets.find((p) => (p as { id: string }).id === where.id) ?? null,
        ),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    } as unknown as PrismaService;
    return new AiSettingsService(
      new ConfigService({ JWT_SECRET: SECRET }),
      prisma,
    );
  }
  const chatPreset = {
    id: '0190e5b8-0000-7000-8000-000000000001',
    kind: 'chat',
    url: 'https://backup.example/v1',
    model: 'backup-chat',
    model2: null,
    key: box.seal('backup-key'),
    proxy: 'http://127.0.0.1:7890',
    elevenlabs: false,
    deepgram: false,
  };

  it('builds the fallback target from the saved setup, key opened, proxy kept', async () => {
    const settings = settingsWith(
      { ...primaryRow, fallbacks: { chat: chatPreset.id } },
      [chatPreset],
    );
    expect(await settings.fallbackTarget('chat')).toEqual({
      endpoint: 'https://backup.example/v1/chat/completions',
      model: 'backup-chat',
      key: 'backup-key',
      proxy: 'http://127.0.0.1:7890',
      provider: 'openai',
    });
    expect(await settings.fallbackTarget('tts')).toBeNull();
  });

  it('forgets a fallback whose setup was deleted', async () => {
    const settings = settingsWith(
      { ...primaryRow, fallbacks: { chat: chatPreset.id } },
      [],
    );
    expect(await settings.fallbackTarget('chat')).toBeNull();
  });

  it('accepts only a saved setup of the same service', async () => {
    const settings = settingsWith(primaryRow, [chatPreset]);
    vi.spyOn(settings, 'view').mockResolvedValue({} as never);
    await expect(
      settings.update({ fallbacks: { tts: chatPreset.id } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      settings.update({
        fallbacks: { chat: chatPreset.id },
        dailyBudgetUsd: 5,
      }),
    ).resolves.toBeDefined();
  });
});
