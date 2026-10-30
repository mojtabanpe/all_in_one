import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';
import { AudioCacheService, type AudioResult } from './audio-cache.service';
import { AiGateway } from '@all-in-one/api/ai';

export function speechCacheKey(
  userId: string,
  endpoint: string,
  model: string,
  text: string,
): string {
  return (
    'aio:tts:v1:' +
    createHash('sha256')
      .update(JSON.stringify([userId, endpoint, model, text.trim()]))
      .digest('hex')
  );
}

export type SpeechResult = AudioResult & {
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
};

/** Text-to-speech with a per-user audio cache; identical requests in flight share one call. */
@Injectable()
export class SpeechService {
  private readonly pending = new Map<string, Promise<SpeechResult>>();

  constructor(
    private readonly gateway: AiGateway,
    private readonly cache: AudioCacheService,
  ) {}

  async speak(
    userId: string,
    text: string,
    voice: SpeechVoice = 'primary',
  ): Promise<SpeechResult> {
    const { endpoint, model } = await this.gateway.speechTarget(userId, voice);
    const normalized = text.trim();
    const key = speechCacheKey(userId, endpoint, model, normalized);
    const running = this.pending.get(key);
    if (running) return running;
    const request = this.load(userId, key, normalized, voice);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(
    userId: string,
    key: string,
    text: string,
    voice: SpeechVoice,
  ): Promise<SpeechResult> {
    const cached = await this.cache.get(key);
    if (cached) return { ...cached, cacheStatus: 'HIT' };
    const result = await this.gateway.speech(userId, text, voice);
    const saved = await this.cache.set(key, result);
    return { ...result, cacheStatus: saved ? 'MISS' : 'BYPASS' };
  }
}
