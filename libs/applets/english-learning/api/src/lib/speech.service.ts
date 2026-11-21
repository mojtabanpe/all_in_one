import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';
import { AudioCacheService, type AudioResult } from './audio-cache.service';
import { AiGateway } from '@all-in-one/api/ai';

interface StarterManifest {
  voice: string;
  files: Record<string, string>;
}

/**
 * Shared by all accounts (owner, 2026-11-08): AI is managed, so the same text with the same voice sounds the same
 * for everyone and is paid for once. Only the hash of the text is the key; a hit never consumes the user's quota.
 */
export function speechCacheKey(
  endpoint: string,
  model: string,
  text: string,
): string {
  return (
    'aio:tts:v2:' +
    createHash('sha256')
      .update(JSON.stringify([endpoint, model, text.trim()]))
      .digest('hex')
  );
}

export type SpeechResult = AudioResult & {
  cacheStatus: 'STATIC' | 'HIT' | 'MISS' | 'BYPASS';
};

function resolveStarterAudioDir(): string | null {
  const candidates = [
    process.env['STARTER_TTS_DIR'],
    join(__dirname, 'assets/starter-tts'),
    join(__dirname, '../../assets/starter-tts'),
    join(process.cwd(), 'assets/starter-tts'),
    join(process.cwd(), 'dist/apps/api/assets/starter-tts'),
    join(process.cwd(), 'libs/applets/english-learning/api/assets/starter-tts'),
  ];
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'manifest.json'))) return dir;
  }
  return null;
}

/** Text-to-speech with pre-generated starter audio and a shared audio cache; identical requests in flight share one call. */
@Injectable()
export class SpeechService {
  private readonly pending = new Map<string, Promise<SpeechResult>>();
  private starterLoaded = false;
  private starterDir: string | null = null;
  private starterFiles: Record<string, string> = {};

  constructor(
    private readonly gateway: AiGateway,
    private readonly cache: AudioCacheService,
  ) {}

  async speak(
    userId: string,
    text: string,
    voice: SpeechVoice = 'primary',
  ): Promise<SpeechResult> {
    const normalized = text.trim();
    if (voice === 'primary') {
      const prebuilt = await this.readStarterAudio(normalized);
      if (prebuilt) return prebuilt;
    }
    const { endpoint, model } = await this.gateway.speechTarget(userId, voice);
    const key = speechCacheKey(endpoint, model, normalized);
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

  private async readStarterAudio(text: string): Promise<SpeechResult | null> {
    if (!this.starterLoaded) {
      this.starterLoaded = true;
      this.starterDir = resolveStarterAudioDir();
      if (this.starterDir) {
        try {
          const raw = readFileSync(
            join(this.starterDir, 'manifest.json'),
            'utf8',
          );
          const parsed = JSON.parse(raw) as Partial<StarterManifest>;
          if (parsed.files && typeof parsed.files === 'object') {
            this.starterFiles = parsed.files;
          }
        } catch {
          this.starterDir = null;
        }
      }
    }
    if (!this.starterDir) return null;
    const file = this.starterFiles[text];
    if (!file || basename(file) !== file) return null;
    try {
      const audio = await readFile(join(this.starterDir, file));
      if (!audio.length) return null;
      return { audio, contentType: 'audio/mpeg', cacheStatus: 'STATIC' };
    } catch {
      return null;
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
