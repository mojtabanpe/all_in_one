import { BILLING_RENEW_WINDOW_MS, canBuyPlan } from './billing';

describe('canBuyPlan', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const at = (ms: number) => new Date(now.getTime() + ms);

  it('allows a purchase without paid access or after it ended', () => {
    expect(canBuyPlan(null, now)).toBe(true);
    expect(canBuyPlan(at(-86_400_000).toISOString(), now)).toBe(true);
  });

  it('allows renewal only in the last three days', () => {
    expect(canBuyPlan(at(BILLING_RENEW_WINDOW_MS), now)).toBe(true);
    expect(canBuyPlan(at(BILLING_RENEW_WINDOW_MS + 1), now)).toBe(false);
    expect(canBuyPlan(at(30 * 86_400_000), now)).toBe(false);
  });
});
