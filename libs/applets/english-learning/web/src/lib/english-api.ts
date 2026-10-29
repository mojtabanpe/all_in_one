import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateWordInput,
  ReviewCard,
  ReviewGrade,
} from '@all-in-one/applets/english-learning/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EnglishApi {
  private readonly http = inject(HttpClient);
  readonly base = `${inject(API_BASE_URL)}/english`;

  startDeck(slug: string): Promise<{ added: number }> {
    return firstValueFrom(
      this.http.post<{ added: number }>(`${this.base}/decks/${slug}/start`, {}),
    );
  }

  review(wordId: string, grade: ReviewGrade): Promise<ReviewCard> {
    return firstValueFrom(
      this.http.post<ReviewCard>(`${this.base}/review/${wordId}`, { grade }),
    );
  }

  addWord(input: CreateWordInput): Promise<ReviewCard> {
    return firstValueFrom(
      this.http.post<ReviewCard>(`${this.base}/words`, input),
    );
  }

  removeWord(wordId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/words/${wordId}`),
    );
  }
}

/** Reads an English word aloud with the browser's speech synthesis, when available. */
export function speak(text: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
