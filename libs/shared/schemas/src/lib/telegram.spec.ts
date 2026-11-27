import {
  GROWTH_EVENTS,
  growthEventSchema,
  telegramLinkRequestSchema,
} from '../index';

describe('telegramLinkRequestSchema and Telegram offer growth events', () => {
  it('accepts optional language and entry values and rejects unknown entries', () => {
    expect(telegramLinkRequestSchema.safeParse({}).success).toBe(true);
    expect(
      telegramLinkRequestSchema.safeParse({
        language: 'fa',
        entry: 'review_end',
      }),
    ).toEqual({
      success: true,
      data: { language: 'fa', entry: 'review_end' },
    });
    expect(
      telegramLinkRequestSchema.safeParse({
        language: 'en',
        entry: 'notify_failed',
      }),
    ).toEqual({
      success: true,
      data: { language: 'en', entry: 'notify_failed' },
    });
    expect(
      telegramLinkRequestSchema.safeParse({ entry: 'other' }).success,
    ).toBe(false);
  });

  it('registers the four Telegram offer growth events within the 32-char column limit', () => {
    const visitorId = '019a59e3-4070-7000-8000-000000000001';
    for (const name of [
      'tg_offer_viewed_review_end',
      'tg_offer_viewed_notify',
      'tg_offer_clicked_review_end',
      'tg_offer_clicked_notify',
    ] as const) {
      expect(name.length).toBeLessThanOrEqual(32);
      expect(GROWTH_EVENTS).toContain(name);
      expect(
        growthEventSchema.safeParse({ visitorId, name, language: 'fa' })
          .success,
      ).toBe(true);
    }
  });
});
