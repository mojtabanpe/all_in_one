import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
} from '@all-in-one/shared/schemas';
import { newReferralCode } from './referral';

describe('newReferralCode (directive 183)', () => {
  it('makes eight characters from the alphabet without look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const code = newReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      expect([...code].every((c) => REFERRAL_CODE_ALPHABET.includes(c))).toBe(
        true,
      );
    }
    expect(newReferralCode(() => 0)).toBe('AAAAAAAA');
  });
});
