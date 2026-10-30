import {
  type Card,
  createCardSchema,
  isBeyondSalvage,
  isLeech,
  matchesCard,
  parseReading,
  previewInterval,
  schedule,
  streakFrom,
} from './english';

const fresh: Pick<
  Card,
  | 'easeFactor'
  | 'intervalDays'
  | 'repetitions'
  | 'lapses'
  | 'dueAt'
  | 'lastReviewedAt'
> = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  dueAt: new Date().toISOString(),
  lastReviewedAt: null,
};
const now = new Date('2026-10-30T10:00:00Z');

describe('SM-2 scheduling (Recall)', () => {
  it('graduates new cards to 1, then 6 days, then interval × ease', () => {
    const first = schedule(fresh, 'good', now);
    expect(first.intervalDays).toBe(1);
    const second = schedule(first, 'good', now);
    expect(second.intervalDays).toBe(6);
    const third = schedule(second, 'good', now);
    expect(third.intervalDays).toBe(Math.round(6 * second.easeFactor));
  });

  it('sends a failed card back in 5 minutes and counts the lapse', () => {
    const failed = schedule({ ...fresh, repetitions: 3, intervalDays: 20 }, 'again', now);
    expect(failed.repetitions).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.easeFactor).toBe(2.3);
    expect(new Date(failed.dueAt).getTime() - now.getTime()).toBe(5 * 60 * 1000);
  });

  it('dampens hard and stretches easy, never below ease 1.3', () => {
    const base = { ...fresh, repetitions: 2, intervalDays: 10 };
    expect(schedule(base, 'hard', now).intervalDays).toBeLessThan(
      schedule(base, 'good', now).intervalDays,
    );
    expect(schedule(base, 'easy', now).intervalDays).toBeGreaterThan(
      schedule(base, 'good', now).intervalDays,
    );
    expect(schedule({ ...fresh, easeFactor: 1.3 }, 'again', now).easeFactor).toBe(1.3);
  });

  it('labels the next interval in Persian', () => {
    expect(previewInterval(fresh, 'again')).toBe('۵ دقیقه');
    expect(previewInterval(fresh, 'good')).toBe('۱ روز');
  });
});

describe('Leitner leeches', () => {
  it('marks a card a leech after 8 lapses with a crushed ease', () => {
    expect(isLeech({ lapses: 8, easeFactor: 1.3 })).toBe(true);
    expect(isLeech({ lapses: 7, easeFactor: 1.3 })).toBe(false);
    expect(isLeech({ lapses: 8, easeFactor: 1.5 })).toBe(false);
    expect(isBeyondSalvage({ suspensions: 2 })).toBe(true);
  });
});

describe('card search', () => {
  const card = { front: 'Résumé', back: 'u3 a summary of your career', examples: '- Send your résumé', unit: '' };
  it('ignores accents and case and matches every word', () => {
    expect(matchesCard(card, 'resume career')).toBe(true);
    expect(matchesCard(card, 'resume banana')).toBe(false);
  });
  it('filters by unit, including a legacy unit in the answer', () => {
    expect(matchesCard(card, 'resume', 'u3')).toBe(true);
    expect(matchesCard(card, 'resume', 'u4')).toBe(false);
  });
});

describe('reader parsing', () => {
  it('splits paragraphs, sentences and word tokens', () => {
    const doc = parseReading("It's late. Go home!\n\nNew day.");
    expect(doc.paragraphs).toHaveLength(2);
    expect(doc.sentences).toEqual(["It's late.", 'Go home!', 'New day.']);
    expect(doc.paragraphs[0].filter((t) => t.word).map((t) => t.text)).toEqual([
      "It's",
      'late',
      'Go',
      'home',
    ]);
  });
  it('groups sentences into chunks of at least minChunk characters', () => {
    const doc = parseReading('One two. Three four. Five six.', 15);
    expect(doc.chunks).toEqual([[0, 1], [2]]);
  });
});

describe('schemas and streaks', () => {
  it('validates unit badges on cards', () => {
    const deckId = '0190f5e2-0000-7000-8000-000000000000';
    expect(createCardSchema.safeParse({ deckId, front: 'a', back: 'b', unit: 'u12' }).success).toBe(true);
    expect(createCardSchema.safeParse({ deckId, front: 'a', back: 'b', unit: 'x' }).success).toBe(false);
  });
  it('counts a streak ending today or yesterday', () => {
    expect(streakFrom(['2026-10-28', '2026-10-29', '2026-10-30'], '2026-10-30')).toBe(3);
    expect(streakFrom(['2026-10-28', '2026-10-29'], '2026-10-30')).toBe(2);
    expect(streakFrom(['2026-10-27'], '2026-10-30')).toBe(0);
  });
});
