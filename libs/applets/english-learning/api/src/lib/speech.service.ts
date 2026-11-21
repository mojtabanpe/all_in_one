import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';
import { AudioCacheService, type AudioResult } from './audio-cache.service';
import { AiGateway } from '@all-in-one/api/ai';

interface StaticManifest {
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

function resolveAudioDir(name: string, envDir?: string): string | null {
  const candidates = [
    envDir,
    join(__dirname, 'assets', name),
    join(__dirname, '../../assets', name),
    join(process.cwd(), 'assets', name),
    join(process.cwd(), 'dist/apps/api/assets', name),
    join(process.cwd(), 'libs/applets/english-learning/api/assets', name),
  ];
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'manifest.json'))) return dir;
  }
  return null;
}

/** A folder of pre-generated MP3s and its `manifest.json` (`files`: key → file name). */
class StaticAudio {
  private loaded = false;
  private dir: string | null = null;
  private files: Record<string, string> = {};

  constructor(
    private readonly name: string,
    private readonly envDir?: string,
  ) {}

  async read(key: string): Promise<SpeechResult | null> {
    if (!this.loaded) {
      this.loaded = true;
      this.dir = resolveAudioDir(this.name, this.envDir);
      if (this.dir) {
        try {
          const parsed = JSON.parse(
            readFileSync(join(this.dir, 'manifest.json'), 'utf8'),
          ) as Partial<StaticManifest>;
          if (parsed.files && typeof parsed.files === 'object')
            this.files = parsed.files;
        } catch {
          this.dir = null;
        }
      }
    }
    if (!this.dir) return null;
    const file = this.files[key];
    if (!file || basename(file) !== file) return null;
    try {
      const audio = await readFile(join(this.dir, file));
      if (!audio.length) return null;
      return { audio, contentType: 'audio/mpeg', cacheStatus: 'STATIC' };
    } catch {
      return null;
    }
  }
}

/** Key of a ready-dialogue sentence in `assets/dialogue-tts/manifest.json`. */
export const dialogueAudioKey = (voice: SpeechVoice, text: string) =>
  `${voice}\n${text.trim()}`;

/** Text-to-speech with pre-generated starter audio and a shared audio cache; identical requests in flight share one call. */
@Injectable()
export class SpeechService {
  private readonly pending = new Map<string, Promise<SpeechResult>>();
  /** Starter cards (primary voice), keyed by text. */
  private readonly starter = new StaticAudio(
    'starter-tts',
    process.env['STARTER_TTS_DIR'],
  );
  /** Ready shadowing dialogues (both voices), keyed by `dialogueAudioKey`. */
  private readonly dialogues = new StaticAudio(
    'dialogue-tts',
    process.env['DIALOGUE_TTS_DIR'],
  );

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
    const prebuilt =
      (await this.dialogues.read(dialogueAudioKey(voice, normalized))) ??
      (voice === 'primary' ? await this.starter.read(normalized) : null);
    if (prebuilt) return prebuilt;
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
