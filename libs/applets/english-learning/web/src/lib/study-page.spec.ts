import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { Card } from '@all-in-one/applets/english-learning/contracts';
import { StudyPage } from './study-page';

const DECK = '0190f5e2-0000-7000-8000-000000000001';
const card = (id: string, front: string, back: string, over: Partial<Card> = {}): Card => ({
  id,
  deckId: DECK,
  front,
  back,
  unit: '',
  examples: '',
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  suspended: false,
  suspensions: 0,
  dueAt: new Date().toISOString(),
  lastReviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe('StudyPage (Recall study)', () => {
  async function setup(due: Card[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: DECK }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(StudyPage);
    // Let promise chains (firstValueFrom) resolve before checking the DOM.
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`/api/english/decks/${DECK}`).flush({
      id: DECK,
      name: 'Tactics',
      description: '',
      color: 'sky',
      createdAt: '',
      updatedAt: '',
    });
    http.expectOne(`/api/english/cards?deckId=${DECK}&due=true`).flush(due);
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(text),
      ) as HTMLButtonElement;
    return { fixture, http, el, button, settle };
  }

  it('flips the card, sends the rating and celebrates at the end', async () => {
    const { fixture, http, el, button, settle } = await setup([card('c1', 'take', 'to carry')]);
    expect(el.textContent).toContain('take');
    expect(el.textContent).not.toContain('to carry');
    button('نمایش جواب').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('to carry');
    expect(el.textContent).toContain('۱ روز');

    button('خوب').click();
    const req = http.expectOne('/api/english/cards/c1/review');
    expect(req.request.body).toEqual({ rating: 'good' });
    req.flush(card('c1', 'take', 'to carry', { repetitions: 1, intervalDays: 1 }));
    await settle();
    expect(el.textContent).toContain('آفرین! تمامش کردی');
  });

  it('brings a failed card back later in the session', async () => {
    const { fixture, http, el, button, settle } = await setup([
      card('c1', 'take', 'to carry'),
      card('c2', 'book', 'a written work'),
    ]);
    button('نمایش جواب').click();
    await fixture.whenStable();
    button('دوباره').click();
    http
      .expectOne('/api/english/cards/c1/review')
      .flush(card('c1', 'take', 'to carry', { lapses: 1 }));
    await settle();
    expect(el.textContent).toContain('book');
    button('نمایش جواب').click();
    await fixture.whenStable();
    button('خوب').click();
    http.expectOne('/api/english/cards/c2/review').flush(card('c2', 'book', 'x'));
    await settle();
    expect(el.textContent).toContain('take');
  });

  it('shows an empty state when nothing is due', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('فعلاً کارتی برای مرور نیست');
  });
});
