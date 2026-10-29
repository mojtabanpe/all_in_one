import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ReviewCard } from '@all-in-one/applets/english-learning/contracts';
import { ReviewPage } from './review-page';

const card = (wordId: string, term: string, meaningFa: string): ReviewCard => ({
  wordId,
  term,
  meaningFa,
  phonetic: null,
  partOfSpeech: 'noun',
  example: null,
  exampleFa: null,
  box: 1,
});

describe('ReviewPage', () => {
  it('reveals the meaning, sends the grade and moves to the next card', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(ReviewPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne('/api/english/review?limit=20')
      .flush([card('w1', 'apple', 'سیب'), card('w2', 'book', 'کتاب')]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(text),
      ) as HTMLButtonElement;

    expect(el.textContent).toContain('apple');
    expect(el.textContent).not.toContain('سیب');
    button('نمایش معنی').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('سیب');

    button('بلد بودم').click();
    const req = http.expectOne('/api/english/review/w1');
    expect(req.request.body).toEqual({ grade: 'good' });
    req.flush({ ...card('w1', 'apple', 'سیب'), box: 2 });
    await fixture.whenStable();
    expect(el.textContent).toContain('book');
  });

  it('shows the empty state when nothing is due', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(ReviewPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/english/review?limit=20')
      .flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(
      'فعلاً واژه‌ای برای مرور نیست',
    );
  });
});
