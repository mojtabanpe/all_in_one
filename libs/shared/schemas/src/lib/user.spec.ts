import {
  loginSchema,
  resolveEnabledApplets,
  updateEnabledAppletsSchema,
  updateProfileSchema,
  userSchema,
} from './user';

describe('userSchema', () => {
  it('accepts a user from the api', () => {
    const result = userSchema.safeParse({
      id: '0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a',
      email: 'admin@example.com',
      phone: null,
      hasPassword: true,
      name: null,
      role: 'ADMIN',
      createdAt: '2026-10-29T20:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a phone-only account (directive 119)', () => {
    const result = userSchema.safeParse({
      id: '0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a',
      email: null,
      phone: '+989121234567',
      hasPassword: false,
      name: null,
      role: 'CUSTOMER',
      createdAt: '2026-11-08T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown role', () => {
    const result = userSchema.safeParse({
      id: '0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a',
      email: 'admin@example.com',
      name: null,
      role: 'OWNER',
      createdAt: '2026-10-29T20:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires a password of at least 8 characters', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success,
    ).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('trims the display name a phone-only account sets', () => {
    const result = updateProfileSchema.safeParse({ name: '  مجتبی  ' });
    expect(result.success && result.data.name).toBe('مجتبی');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(updateProfileSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name longer than 80 characters', () => {
    expect(
      updateProfileSchema.safeParse({ name: 'x'.repeat(81) }).success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({ name: 'x'.repeat(80) }).success,
    ).toBe(true);
  });
});

describe('resolveEnabledApplets & updateEnabledAppletsSchema', () => {
  it('filters out expenses for non-admin users', () => {
    expect(
      resolveEnabledApplets(
        ['planner', 'english', 'health', 'expenses'],
        'CUSTOMER',
      ),
    ).toEqual(['planner', 'english', 'health']);
    expect(
      resolveEnabledApplets(
        ['planner', 'english', 'health', 'expenses'],
        'ADMIN',
      ),
    ).toEqual(['planner', 'english', 'health', 'expenses']);
  });

  it('defaults to all role-allowed applets when unset', () => {
    expect(resolveEnabledApplets(undefined, 'CUSTOMER')).toEqual([
      'planner',
      'english',
      'health',
    ]);
    expect(resolveEnabledApplets(null, 'ADMIN')).toEqual([
      'planner',
      'english',
      'health',
      'expenses',
    ]);
  });

  it('validates enabledApplets payload', () => {
    expect(
      updateEnabledAppletsSchema.safeParse({
        enabledApplets: ['planner', 'health'],
      }).success,
    ).toBe(true);
    expect(
      updateEnabledAppletsSchema.safeParse({
        enabledApplets: ['unknown'],
      }).success,
    ).toBe(false);
    expect(
      updateEnabledAppletsSchema.safeParse({
        enabledApplets: [],
      }).success,
    ).toBe(false);
  });
});
