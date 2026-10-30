import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  Card,
  CardAnswer,
  ConversationSituation,
  CreateCardInput,
  CreateDeckInput,
  Deck,
  DeckWithStats,
  Dialogue,
  GeneratedText,
  Rating,
  ReadingLevel,
  ReadingText,
  ReadingTopic,
  SpeechVoice,
  Transcript,
  UpdateCardInput,
  UpdateDeckInput,
  WritingFeedback,
  WritingTask,
} from '@all-in-one/applets/english-learning/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

/** HTTP client for the English applet (Recall) api. */
@Injectable({ providedIn: 'root' })
export class EnglishApi {
  private readonly http = inject(HttpClient);
  readonly base = `${inject(API_BASE_URL)}/english`;

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.base + path));
  }
  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  private delete(path: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.base + path));
  }

  decks(): Promise<DeckWithStats[]> {
    return this.get('/decks');
  }
  deck(id: string): Promise<Deck> {
    return this.get(`/decks/${id}`);
  }
  createDeck(input: CreateDeckInput): Promise<Deck> {
    return this.post('/decks', input);
  }
  updateDeck(id: string, input: UpdateDeckInput): Promise<Deck> {
    return this.patch(`/decks/${id}`, input);
  }
  removeDeck(id: string): Promise<void> {
    return this.delete(`/decks/${id}`);
  }
  copyStarter(slug: string): Promise<Deck> {
    return this.post(`/starter-decks/${slug}`);
  }

  cards(deckId: string, dueOnly = false): Promise<Card[]> {
    return this.get(`/cards?deckId=${deckId}${dueOnly ? '&due=true' : ''}`);
  }
  createCard(input: CreateCardInput): Promise<Card> {
    return this.post('/cards', input);
  }
  updateCard(id: string, input: UpdateCardInput): Promise<Card> {
    return this.patch(`/cards/${id}`, input);
  }
  removeCard(id: string): Promise<void> {
    return this.delete(`/cards/${id}`);
  }
  review(id: string, rating: Rating): Promise<Card> {
    return this.post(`/cards/${id}/review`, { rating });
  }
  unsuspend(id: string): Promise<Card> {
    return this.post(`/cards/${id}/unsuspend`);
  }
  suspend(id: string): Promise<Card> {
    return this.post(`/cards/${id}/suspend`);
  }

  texts(): Promise<ReadingText[]> {
    return this.get('/texts');
  }
  text(id: string): Promise<ReadingText> {
    return this.get(`/texts/${id}`);
  }
  createText(title: string, body: string, ai: boolean): Promise<ReadingText> {
    return this.post('/texts', { title, body, ai });
  }
  rateText(id: string, rating: number, note: string): Promise<ReadingText> {
    return this.patch(`/texts/${id}/review`, { rating, note });
  }
  removeText(id: string): Promise<void> {
    return this.delete(`/texts/${id}`);
  }

  cardAnswer(front: string, deck?: string, context?: string): Promise<CardAnswer> {
    return this.post('/ai/card-answer', {
      front,
      ...(deck ? { deck } : {}),
      ...(context ? { context: context.slice(0, 1000) } : {}),
    });
  }
  readingText(topic: ReadingTopic, level: ReadingLevel): Promise<GeneratedText> {
    return this.post('/ai/reading-text', { topic, level });
  }
  writingTask(situation: ConversationSituation, level: ReadingLevel): Promise<WritingTask> {
    return this.post('/ai/practice/writing-task', { situation, level });
  }
  writingFeedback(
    situation: ConversationSituation,
    level: ReadingLevel,
    task: WritingTask,
    answer: string,
  ): Promise<WritingFeedback> {
    return this.post('/ai/practice/writing-feedback', {
      situation,
      level,
      scenario: task.scenario,
      ...(task.message ? { message: task.message } : {}),
      answer,
    });
  }
  dialogue(situation: ConversationSituation, level: ReadingLevel): Promise<Dialogue> {
    return this.post('/ai/practice/dialogue', { situation, level });
  }
  /** Sends the raw recording; the api forwards it to speech-to-text. */
  transcribe(audio: Blob): Promise<Transcript> {
    return firstValueFrom(
      this.http.post<Transcript>(this.base + '/ai/practice/transcribe', audio, {
        headers: { 'Content-Type': audio.type.split(';')[0] },
      }),
    );
  }
  speech(text: string, voice: SpeechVoice = 'primary'): Promise<Blob> {
    return firstValueFrom(
      this.http.post(
        this.base + '/speech',
        { text, ...(voice === 'secondary' ? { voice } : {}) },
        { responseType: 'blob' },
      ),
    );
  }
}

/** Example sentences are a Markdown list ("- one\n- two"); returns the plain lines. */
export function exampleLines(examples: string): string[] {
  return examples
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** Remembers a small preference (last deck, unit); storage may be unavailable. */
export function remember(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) ?? '';
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the feature still works without it.
  }
  return value ?? '';
}
