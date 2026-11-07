import type { PrismaService } from '@all-in-one/api/db';
import { ConfigService } from '@nestjs/config';
import {
  AiSettingsService,
  deepgramBase,
  elevenBase,
  endpointFor,
} from './ai-settings.service';
import {
  AiGateway,
  isRetryable,
  retryDelay,
  transcriptOf,
} from './ai-gateway.service';
import { isPrivateAddress } from './net-guard';
import { SecretBox } from './secret-box';

const withManagedRow = (settings?: object) =>
  ({
    managedAiConfiguration: {
      findUnique: vi.fn().mockResolvedValue(settings ? { settings } : null),
    },
  }) as unknown as PrismaService;

describe('api-ai', () => {
  it('resolves managed targets and reports only capability flags', async () => {
    const settings = new AiSettingsService(
      new ConfigService({
        MANAGED_AI_CHAT_URL: 'https://managed.example/v1',
        MANAGED_AI_CHAT_MODEL: 'managed-chat',
        MANAGED_AI_CHAT_KEY: 'fixture-key',
        MANAGED_AI_TTS_PROVIDER: 'deepgram',
        MANAGED_AI_TTS_KEY: 'fixture-tts-key',
        MANAGED_AI_TTS_SECONDARY_MODEL: 'secondary-voice',
      }),
      withManagedRow(),
    );
    expect(await settings.status()).toEqual({
      chat: true,
      tts: true,
      stt: false,
    });
    expect((await settings.targets()).chat).toMatchObject({
      endpoint: 'https://managed.example/v1/chat/completions',
      model: 'managed-chat',
      key: 'fixture-key',
    });
    expect((await settings.targets()).tts).toMatchObject({
      endpoint: 'https://api.deepgram.com',
      model2: 'secondary-voice',
      provider: 'deepgram',
    });
  });

  it('uses the sealed operator snapshot and ignores the environment once configured', async () => {
    const secret = 'a'.repeat(40);
    const box = new SecretBox(secret);
    const settings = new AiSettingsService(
      new ConfigService({
        JWT_SECRET: secret,
        MANAGED_AI_CHAT_URL: 'https://fallback.example/v1',
        MANAGED_AI_CHAT_MODEL: 'fallback',
      }),
      withManagedRow({
        chatUrl: 'https://managed.example/v1',
        chatModel: 'imported-model',
        chatKey: box.seal('test-managed-key'),
        chatProxyOn: true,
        chatProxy: 'http://proxy.example:7890',
        ttsEleven: true,
        ttsKey: box.seal('speech-fixture'),
        ttsModel: 'voice-one',
        ttsModel2: 'voice-two',
      }),
    );
    const targets = await settings.targets();
    expect(targets.chat).toMatchObject({
      endpoint: 'https://managed.example/v1/chat/completions',
      model: 'imported-model',
      key: 'test-managed-key',
      proxy: 'http://proxy.example:7890',
    });
    expect(targets.tts).toMatchObject({
      provider: 'elevenlabs',
      model2: 'voice-two',
    });
  });

  it('checks the daily quota before a chat call and records its tokens after', async () => {
    const config = new ConfigService({
      MANAGED_AI_CHAT_URL: 'https://managed.example/v1',
      MANAGED_AI_CHAT_MODEL: 'small',
    });
    const settings = new AiSettingsService(config, withManagedRow());
    const usage = {
      check: vi.fn().mockResolvedValue(undefined),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const gateway = new AiGateway(
      settings,
      config,
      { access: vi.fn().mockResolvedValue({ tier: 'trial' }) },
      usage as never,
    );
    const fetchSpy = vi
      .spyOn(gateway as never, 'request' as never)
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'hi' } }],
              usage: {
                total_tokens: 321,
                prompt_tokens: 300,
                completion_tokens: 21,
              },
            }),
          ) as never,
      );
    await gateway.chat('user', [{ role: 'user', content: 'hello' }]);
    expect(usage.check).toHaveBeenCalledWith('user', 'trial', 'chat', 0);
    expect(usage.record).toHaveBeenCalledWith('user', 'chat', 321, {
      outputUnits: 21,
      tier: 'trial',
    });

    // The scope check's own call is not counted.
    usage.check.mockClear();
    usage.record.mockClear();
    await gateway.chat('user', [], { meter: false });
    expect(usage.check).not.toHaveBeenCalled();
    expect(usage.record).not.toHaveBeenCalled();

    // A used-up quota stops the call before it is made.
    usage.check.mockRejectedValueOnce(
      Object.assign(new Error('quota'), { status: 429 }),
    );
    fetchSpy.mockClear();
    await expect(gateway.chat('user', [])).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects free AI before resolving providers, including cached speech', async () => {
    const config = new ConfigService({
      MANAGED_AI_TTS_URL: 'https://managed.example/v1',
    });
    const settings = new AiSettingsService(config, withManagedRow());
    const targets = vi.spyOn(settings, 'targets');
    const access = vi.fn().mockResolvedValue({ tier: 'free' });
    const gateway = new AiGateway(settings, config, { access });

    await expect(gateway.chat('user', [])).rejects.toMatchObject({
      status: 402,
    });
    await expect(gateway.speechTarget('user', 'primary')).rejects.toMatchObject(
      { status: 402 },
    );
    await expect(
      gateway.transcribe('user', Buffer.alloc(1), 'audio/wav'),
    ).rejects.toMatchObject({ status: 402 });
    expect(targets).not.toHaveBeenCalled();

    for (const tier of ['trial', 'earned', 'paid']) {
      access.mockResolvedValue({ tier });
      await expect(
        gateway.speechTarget('user', 'primary'),
      ).resolves.toMatchObject({
        endpoint: 'https://managed.example/v1/audio/speech',
      });
    }
  });

  it('seals and opens keys, and a rotated secret reads as no key', () => {
    const box = new SecretBox('a'.repeat(40));
    const sealed = box.seal('sk-test-123');
    expect(sealed).not.toContain('sk-test');
    expect(box.open(sealed)).toBe('sk-test-123');
    expect(new SecretBox('b'.repeat(40)).open(sealed)).toBeNull();
    expect(box.open(null)).toBeNull();
  });

  it('accepts a base url or the full endpoint', () => {
    expect(endpointFor('chat', 'https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(endpointFor('chat', 'https://x.io/v1/chat/completions')).toBe(
      'https://x.io/v1/chat/completions',
    );
    expect(endpointFor('tts', 'https://x.io/v1')).toBe(
      'https://x.io/v1/audio/speech',
    );
    expect(endpointFor('stt', 'https://x.io/v1')).toBe(
      'https://x.io/v1/audio/transcriptions',
    );
  });

  it.each([
    ['127.0.0.1', true],
    ['10.0.0.8', true],
    ['169.254.169.254', true],
    ['::1', true],
    ['::ffff:10.0.0.1', true],
    ['8.8.8.8', false],
    ['2606:4700::1111', false],
  ])('treats %s as private: %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe('elevenBase', () => {
  it('defaults to api.elevenlabs.io and drops /v1', () => {
    expect(elevenBase('')).toBe('https://api.elevenlabs.io');
    expect(elevenBase('https://x.io/v1/')).toBe('https://x.io');
  });
});

describe('deepgram', () => {
  it('defaults to api.deepgram.com', () => {
    expect(deepgramBase(null)).toBe('https://api.deepgram.com');
  });
  it('reads OpenAI and Deepgram transcripts', () => {
    expect(transcriptOf({ text: ' hi ' })).toBe('hi');
    expect(
      transcriptOf({
        results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
      }),
    ).toBe('hello');
    expect(transcriptOf({})).toBe('');
  });
});

describe('speech retry', () => {
  it('retries rate limits and server errors only', () => {
    expect([429, 500, 503, 408].every(isRetryable)).toBe(true);
    expect([400, 401, 404].some(isRetryable)).toBe(false);
  });
  it('waits longer each time, or as the service asks (capped)', () => {
    expect(retryDelay(1)).toBe(600);
    expect(retryDelay(2)).toBe(1200);
    expect(retryDelay(1, '2')).toBe(2000);
    expect(retryDelay(1, '60')).toBe(4000);
  });
});
