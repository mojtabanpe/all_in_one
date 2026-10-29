import {
  createWordSchema,
  MAX_BOX,
  scheduleReview,
  streakFrom,
} from './english';

const now = new Date('2026-10-29T10:00:00Z');
const daysLater = (d: Date) => (d.getTime() - now.getTime()) / 86_400_000;

describe('scheduleReview (Leitner)', () => {
  it('"again" resets to box 1 and repeats in 10 minutes', () => {
    const r = scheduleReview(4, 'again', now);
    expect(r).toMatchObject({ box: 1, lapse: true });
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('"good" moves up one box with that box interval', () => {
    const r = scheduleReview(1, 'good', now);
    expect(r.box).toBe(2);
    expect(daysLater(r.dueAt)).toBe(2);
  });

  it('"easy" jumps two boxes, capped at the last box', () => {
    expect(scheduleReview(2, 'easy', now).box).toBe(4);
    expect(scheduleReview(MAX_BOX, 'easy', now).box).toBe(MAX_BOX);
  });

  it('"hard" keeps the box with half the interval', () => {
    const r = scheduleReview(3, 'hard', now);
    expect(r.box).toBe(3);
    expect(daysLater(r.dueAt)).toBe(2);
  });
});

describe('streakFrom', () => {
  it('counts consecutive days ending today', () => {
    expect(
      streakFrom(['2026-10-27', '2026-10-28', '2026-10-29'], '2026-10-29'),
    ).toBe(3);
  });
  it('keeps a streak alive until the end of today', () => {
    expect(streakFrom(['2026-10-27', '2026-10-28'], '2026-10-29')).toBe(2);
  });
  it('breaks on a gap', () => {
    expect(streakFrom(['2026-10-25', '2026-10-28'], '2026-10-29')).toBe(1);
  });
});

describe('createWordSchema', () => {
  it('requires a term and a Persian meaning', () => {
    expect(createWordSchema.safeParse({ term: 'apple' }).success).toBe(false);
    expect(
      createWordSchema.parse({ term: ' apple ', meaningFa: 'سیب' }),
    ).toEqual({ term: 'apple', meaningFa: 'سیب' });
  });
});
