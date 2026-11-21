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

  it('serves pre-generated starter audio without calling the TTS gateway or cache', async () => {
    const { service, gateway, cache } = setup();
    const term = await service.speak('free', '  weekend  ');
    const definition = await service.speak('free', 'To stop sleeping.');
    expect(term.cacheStatus).toBe('STATIC');
    expect(term.contentType).toBe('audio/mpeg');
    expect(term.audio.length).toBeGreaterThan(1000);
    expect(definition.cacheStatus).toBe('STATIC');
    expect(definition.audio.length).toBeGreaterThan(1000);
    expect(gateway.speechTarget).not.toHaveBeenCalled();
    expect(gateway.speech).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('uses the TTS gateway for secondary dialogue voice even when text matches a starter card', async () => {
    const { service, gateway } = setup();
    const res = await service.speak('user-a', 'weekend', 'secondary');
    expect(res.cacheStatus).toBe('MISS');
    expect(gateway.speech).toHaveBeenCalledTimes(1);
  });
});

describe('SpeechService ready dialogue audio', () => {
  it('serves both voices of a ready dialogue from static files, even without AI access', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { dialogueAudioKey } = await import('./speech.service');
    const dir = mkdtempSync(join(tmpdir(), 'dialogue-tts-'));
    writeFileSync(join(dir, 'a.mp3'), 'woman');
    writeFileSync(join(dir, 'b.mp3'), 'man');
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        files: {
          [dialogueAudioKey('primary', 'Hi, Ben!')]: 'a.mp3',
          [dialogueAudioKey('secondary', 'Hi, Sara!')]: 'b.mp3',
        },
      }),
    );
    const previous = process.env['DIALOGUE_TTS_DIR'];
    process.env['DIALOGUE_TTS_DIR'] = dir;
    try {
      const { service, gateway } = setup();
      const woman = await service.speak('free', ' Hi, Ben! ', 'primary');
      const man = await service.speak('free', 'Hi, Sara!', 'secondary');
      expect(woman.cacheStatus).toBe('STATIC');
      expect(woman.audio.toString()).toBe('woman');
      expect(man.audio.toString()).toBe('man');
      expect(gateway.speechTarget).not.toHaveBeenCalled();
      // The same text in the other voice is not in the manifest: normal path.
      await expect(
        service.speak('free', 'Hi, Ben!', 'secondary'),
      ).rejects.toThrow('upgrade');
    } finally {
      if (previous === undefined) delete process.env['DIALOGUE_TTS_DIR'];
      else process.env['DIALOGUE_TTS_DIR'] = previous;
    }
  });
});
