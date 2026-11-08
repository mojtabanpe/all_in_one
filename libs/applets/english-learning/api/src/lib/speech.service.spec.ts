import { HttpException } from '@nestjs/common';
import type { AiGateway } from '@all-in-one/api/ai';
import type { AudioCacheService, AudioResult } from './audio-cache.service';
import { SpeechService, speechCacheKey } from './speech.service';

const target = { endpoint: 'https://tts.example/v1/speak', model: 'voice-a' };

function setup() {
  const store = new Map<string, AudioResult>();
  const cache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: AudioResult) => {
      store.set(key, value);
      return true;
    }),
  };
  const gateway = {
    speechTarget: vi.fn(async (userId: string) => {
      if (userId === 'free') throw new HttpException('upgrade', 402);
      return target;
    }),
    speech: vi.fn(async () => ({
      audio: Buffer.from('mp3'),
      contentType: 'audio/mpeg',
    })),
  };
  const service = new SpeechService(
    gateway as unknown as AiGateway,
    cache as unknown as AudioCacheService,
  );
  return { service, gateway, cache };
}

describe('SpeechService shared audio cache', () => {
  it('pays for a text once: another account gets the cached audio', async () => {
    const { service, gateway } = setup();
    const first = await service.speak('user-a', ' Good morning ');
    const second = await service.speak('user-b', 'Good morning');
    expect(first.cacheStatus).toBe('MISS');
    expect(second.cacheStatus).toBe('HIT');
    expect(second.audio.toString()).toBe('mp3');
    expect(gateway.speech).toHaveBeenCalledTimes(1);
  });

  it('keys on voice and text only, never on the account', () => {
    expect(speechCacheKey(target.endpoint, target.model, 'Hi')).toBe(
      speechCacheKey(target.endpoint, target.model, ' Hi '),
    );
    expect(speechCacheKey(target.endpoint, 'voice-b', 'Hi')).not.toBe(
      speechCacheKey(target.endpoint, target.model, 'Hi'),
    );
  });

  it('still refuses an account without AI access before reading the cache', async () => {
    const { service, cache } = setup();
    await service.speak('user-a', 'Good morning');
    await expect(service.speak('free', 'Good morning')).rejects.toThrow(
      'upgrade',
    );
    expect(cache.get).toHaveBeenCalledTimes(1);
  });
});
