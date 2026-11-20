import {
  BILLING_RENEW_WINDOW_MS,
  canBuyPlan,
  normalizeReferralCode,
  referralAttachSchema,
} from './billing';

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

describe('invitation codes (directive 183)', () => {
  it('accepts a code typed with spaces, dashes or lower case', () => {
    expect(normalizeReferralCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeReferralCode('H۵G۷۹۸Z۲')).toBe('H5G798Z2');
    expect(referralAttachSchema.safeParse({ code: 'abcd 2345' }).success).toBe(
      true,
    );
  });
  it('refuses look-alike characters, wrong lengths and other values', () => {
    for (const value of [
      'ABCD234O',
      'ABCD2341',
      'ABC2345',
      'ABCD23456',
      '',
      null,
      42,
    ])
      expect(normalizeReferralCode(value)).toBeNull();
  });
});
