import { inject, Injectable } from '@angular/core';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';
import { aioToast } from '@all-in-one/ui';
import { EnglishApi } from './english-api';

/**
 * Plays server-side speech (Recall's TtsService): one clip at a time, or a list
 * of chunks read aloud in order while the next chunk is fetched.
 */
@Injectable({ providedIn: 'root' })
export class Tts {
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
        aioToast.error('پخش تلفظ ممکن نشد.');
      }
    }
  }

  /** Resolves when every chunk has played or reading was stopped. */
  async readAloud(
    chunks: string[],
    onChunk: (index: number) => void,
    voices: SpeechVoice[] = [],
  ): Promise<void> {
    const generation = ++this.generation;
    this.cancel();
    const parts = chunks.map((c) => c.trim());
    let next: Promise<Blob> | null = null;
    try {
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        const current = next ?? this.api.speech(parts[i], voices[i]);
        const following = parts.findIndex((p, j) => j > i && !!p);
        next =
          following > 0
            ? this.api.speech(parts[following], voices[following])
            : null;
        next?.catch(() => undefined);
        const blob = await current;
        if (generation !== this.generation) return;
        onChunk(i);
        await this.play(blob, generation);
        if (generation !== this.generation) return;
      }
    } catch {
      if (generation === this.generation)
        aioToast.error('خواندن متن ممکن نشد.');
    } finally {
      if (generation === this.generation) this.cancel();
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
