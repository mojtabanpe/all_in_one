import { inject, Injectable } from '@angular/core';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';
import { AioNotifications } from '@all-in-one/ui';
import { EnglishApi } from './english-api';

/**
 * Plays server-side speech (Recall's TtsService): one clip at a time, or a list
 * of chunks read aloud in order while the next chunk is fetched.
 */
@Injectable({
  providedIn: 'root',
})
export class Tts {
  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(EnglishApi);
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private generation = 0;
  private finish: (() => void) | null = null;
  /** Playback speed, e.g. 0.75 for slower listening practice. */
  rate = 1;

  async speak(text: string, voice: SpeechVoice = 'primary'): Promise<void> {
    const trimmed = text?.trim();
    if (!trimmed) return;
    const generation = ++this.generation;
    this.cancel();
    try {
      const blob = await this.api.speech(trimmed, voice);
      if (generation !== this.generation) return;
      await this.play(blob, generation);
    } catch {
      if (generation === this.generation) {
        this.cancel();
        this.notifications.error('Unable to play pronunciation.');
      }
    }
  }

  /**
   * Reads the chunks in order from `start`, fetching the next one while one plays.
   * A chunk that fails is asked for again (twice); resolves with the index reading
   * stopped at after an error, so the caller can resume there, or -1.
   */
  async readAloud(
    chunks: string[],
    onChunk: (index: number) => void,
    voices: SpeechVoice[] = [],
    start = 0,
  ): Promise<number> {
    const generation = ++this.generation;
    this.cancel();
    const parts = chunks.map((c) => c.trim());
    const fetchChunk = (i: number) => {
      const p = this.speechWithRetry(parts[i], voices[i], generation);
      p.catch(() => undefined);
      return p;
    };
    let next: Promise<Blob> | null = null;
    let at = start;
    try {
      for (let i = start; i < parts.length; i++) {
        if (!parts[i]) continue;
        at = i;
        const current = next ?? fetchChunk(i);
        const following = parts.findIndex((p, j) => j > i && !!p);
        next = following > 0 ? fetchChunk(following) : null;
        let blob: Blob;
        try {
          blob = await current;
        } catch {
          // The prefetched copy failed: one more fresh try before giving up.
          if (generation !== this.generation) return -1;
          blob = await this.speechWithRetry(parts[i], voices[i], generation);
        }
        if (generation !== this.generation) return -1;
        onChunk(i);
        await this.play(blob, generation);
        if (generation !== this.generation) return -1;
      }
      return -1;
    } catch {
      if (generation !== this.generation) return -1;
      this.notifications.error(
        'خواندن قطع شد. دوباره «Read aloud» را بزن تا از همین‌جا ادامه دهد.',
      );
      return at;
    } finally {
      if (generation === this.generation) this.cancel();
    }
  }

  /** One clip, asked for up to three times (the speech service fails now and then). */
  private async speechWithRetry(
    text: string,
    voice: SpeechVoice | undefined,
    generation: number,
  ): Promise<Blob> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.api.speech(text, voice);
      } catch (error) {
        if (attempt >= 3 || generation !== this.generation) throw error;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  stop(): void {
    this.generation++;
    this.cancel();
  }

  private play(blob: Blob, generation: number): Promise<void> {
    this.cancel();
    this.url = URL.createObjectURL(blob);
    const audio = (this.audio = new Audio(this.url));
    audio.playbackRate = this.rate;
    return new Promise<void>((resolve, reject) => {
      this.finish = resolve;
      audio.onended = () => {
        if (generation === this.generation) this.cancel();
        resolve();
      };
      audio.onerror = () => reject(new Error('Audio playback failed'));
      audio.play().catch(reject);
    });
  }

  private cancel(): void {
    this.audio?.pause();
    this.audio = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    const finish = this.finish;
    this.finish = null;
    finish?.();
  }
}
