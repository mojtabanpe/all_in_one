import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AuthGuard,
  IS_PUBLIC,
  ROLES,
  SESSION_COOKIE,
} from '@all-in-one/api/auth';
import {
  GROWTH_CLIENTS,
  GROWTH_QA_SOURCES,
  GROWTH_SIGNUP_SOURCES,
  growthAccountActivationFilterSchema,
  growthOptedOut,
  isReservedTestEmail,
  signupSourceOf,
} from '@all-in-one/shared/schemas';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';

// Synthetic fixtures only: no real account, time or source.
const now = new Date('2031-03-20T10:00:00Z');
const range = { from: '2031-03-01', to: '2031-03-19' };

const row = (over: Record<string, unknown>) => ({
  level: 0,
  source: null,
  platform: null,
  accounts: 0n,
  excluded: 0n,
  untimed: 0n,
  phone_only: 0n,
  e0: 0n,
  s0: 0n,
  e1: 0n,
  s1: 0n,
  e7: 0n,
  s7: 0n,
  median: null,
  ...over,
});

describe('Account activation contract', () => {
  it('accepts only two ISO days in order and nothing else', () => {
    expect(growthAccountActivationFilterSchema.safeParse(range).success).toBe(
      true,
    );
    for (const input of [
      {},
      { from: range.from },
      { from: '2031-3-1', to: range.to },
      { from: range.to, to: range.from },
      { ...range, userId: 'x' },
      { ...range, source: 'instagram' },
    ])
      expect(growthAccountActivationFilterSchema.safeParse(input).success).toBe(
        false,
      );
  });

  it('keeps only controlled source values, never a free-form one', () => {
    expect(signupSourceOf(undefined)).toBe('direct');
    expect(signupSourceOf('')).toBe('direct');
    expect(signupSourceOf(' Instagram ')).toBe('instagram');
    expect(signupSourceOf('referral')).toBe('referral');
    expect(signupSourceOf('QA')).toBe('qa');
    // Look-alikes of a phone number, an ID or a reserved value never come back as typed.
    for (const value of [
      '09120000000',
      '+989120000000',
      'user-1234',
      '019a59e3-4070-7000-8000-000000000001',
      'tg_partner',
      'اینستاگرام',
      'direct',
      'unknown',
      'other',
    ])
      expect(signupSourceOf(value)).toBe('other');
  });

  it('fits every breakdown group, null included, under the 20-group bound', () => {
    const sources = GROWTH_SIGNUP_SOURCES.filter(
      (source) => !(GROWTH_QA_SOURCES as readonly string[]).includes(source),
    );
    expect(sources.length + 1).toBeLessThanOrEqual(20);
    expect(GROWTH_CLIENTS.length + 2).toBeLessThanOrEqual(20);
  });

  it('recognises reserved test domains and the analytics opt-out cookie', () => {
    for (const email of [
      'a@example.com',
      'a@EXAMPLE.org',
      'a@mail.example.net',
      'a@x.test',
      'a@x.example',
      'a@x.invalid',
      'a@localhost',
      'a@app.localhost',
    ])
      expect(isReservedTestEmail(email)).toBe(true);
    for (const email of [
      null,
      'a@gmail.com',
      'a@example.co',
      'a@notexample.com',
      'a@test.ir',
      'example.com@gmail.com',
    ])
      expect(isReservedTestEmail(email)).toBe(false);
    expect(growthOptedOut('x=1; aio_growth_preference=denied')).toBe(true);
    expect(growthOptedOut('aio_growth_consent=denied')).toBe(true);
    expect(growthOptedOut('aio_growth_preference=granted')).toBe(false);
    expect(growthOptedOut(undefined)).toBe(false);
  });
});

describe('Account activation endpoint', () => {
  it('is admin-only, never public, and blocks a customer session', async () => {
    const reflector = new Reflector();
    const handler = GrowthController.prototype.accountActivation;
    expect(reflector.get(ROLES, handler)).toEqual(['ADMIN']);
    expect(reflector.get(IS_PUBLIC, handler)).toBeUndefined();
    const jwt = new JwtService({
      secret: 'test-secret-test-secret-test-secret',
    });
    const roles: Record<string, string> = { c1: 'CUSTOMER', a1: 'ADMIN' };
    const guard = new AuthGuard(jwt, reflector, {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => ({
          role: roles[where.id],
          sessionVersion: 0,
        }),
      },
    } as never);
    const ctx = async (sub: string) => {
      const request = {
        headers: {
          cookie: `${SESSION_COOKIE}=${await jwt.signAsync({ sub, sv: 0 })}`,
        },
      };
      return {
        getHandler: () => handler,
        getClass: () => GrowthController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
    };
    await expect(guard.canActivate(await ctx('c1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(await ctx('a1'))).resolves.toBe(true);
  });

  it('stays off with analytics disabled and audits a successful admin read', async () => {
    const accountActivation = vi.fn().mockResolvedValue({ ok: true });
    const auditReport = vi.fn();
    const off = new GrowthController(
      { accountActivation, auditReport } as never,
      { get: () => 'false' } as never,
    );
    expect(() => off.accountActivation({ id: 'a1' } as never, range)).toThrow();
    expect(accountActivation).not.toHaveBeenCalled();
    const on = new GrowthController(
      { accountActivation, auditReport } as never,
      { get: () => 'true' } as never,
    );
    await expect(
      on.accountActivation({ id: 'a1' } as never, range),
    ).resolves.toEqual({ ok: true });
    expect(accountActivation).toHaveBeenCalledWith(range);
    expect(auditReport).toHaveBeenCalledWith('a1', 'SUMMARY', 'VIEW');
  });

  it('rejects windows outside the retained 90 days or in the future before querying', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new GrowthService({ $queryRaw: queryRaw } as never);
    for (const filter of [
      { from: '2030-12-20', to: '2031-03-19' },
      { from: '2031-03-01', to: '2031-03-21' },
      { from: '2031-03-10', to: '2031-03-09' },
    ])
      await expect(service.accountActivation(filter, now)).rejects.toThrow();
    expect(queryRaw).not.toHaveBeenCalled();
    // Oldest allowed day and today are both accepted.
    await expect(
      service.accountActivation({ from: '2030-12-21', to: '2031-03-20' }, now),
    ).resolves.toBeDefined();
  });
});

describe('Account activation aggregation', () => {
  it('returns only contract counts, one-decimal percentages and null for zero denominators', async () => {
    const service = new GrowthService({
      $queryRaw: vi.fn().mockResolvedValue([
        row({
          level: 3,
          accounts: 7n,
          excluded: 2n,
          untimed: 1n,
          phone_only: 3n,
          e0: 6n,
          s0: 2n,
          e1: 3n,
          s1: 1n,
          e7: 0n,
          s7: 0n,
          median: 75.04,
        }),
        row({ level: 1, source: 'instagram', accounts: 2n, e0: 2n, s0: 1n }),
        row({ level: 1, source: null, accounts: 4n, e0: 3n, s0: 1n }),
        row({ level: 1, source: 'direct', accounts: 1n, e0: 1n }),
        row({ level: 2, platform: 'bazaar', accounts: 5n, e0: 4n, s0: 2n }),
        row({ level: 2, platform: null, accounts: 2n, e0: 2n }),
      ]),
    } as never);
    const report = await service.accountActivation(range, now);
    expect(report).toEqual({
      from: range.from,
      to: range.to,
      overall: {
        firstAction: { eligible: 6, successful: 2, percent: 33.3 },
        d1: { eligible: 3, successful: 1, percent: 33.3 },
        d7: { eligible: 0, successful: 0, percent: null },
        medianFirstActionMinutes: 75,
      },
      coverage: {
        accounts: 7,
        excludedTestAccounts: 2,
        untimedReviewAccounts: 1,
        phoneOnlyAccounts: 3,
      },
      bySource: [
        expect.objectContaining({ source: null }),
        expect.objectContaining({ source: 'instagram' }),
        expect.objectContaining({ source: 'direct' }),
      ],
      bySignupPlatform: [
        expect.objectContaining({ signupPlatform: 'bazaar' }),
        expect.objectContaining({ signupPlatform: null }),
      ],
    });
    expect(report.bySource[1].metrics.firstAction).toEqual({
      eligible: 2,
      successful: 1,
      percent: 50,
    });
    expect(report.bySource[2].metrics.firstAction.percent).toBe(0);
    expect(report.bySource[0].metrics.medianFirstActionMinutes).toBeNull();
    // No identifier or timestamp field leaves the report.
    expect(JSON.stringify(report)).not.toMatch(/userId|"id"|email|phone"|At"/);
  });

  it('reports an empty window as zero counts, null rates and empty breakdowns', async () => {
    const service = new GrowthService({
      $queryRaw: vi.fn().mockResolvedValue([row({ level: 3 })]),
    } as never);
    const empty = {
      eligible: 0,
      successful: 0,
      percent: null,
    };
    expect(await service.accountActivation(range, now)).toEqual({
      ...range,
      overall: {
        firstAction: empty,
        d1: empty,
        d7: empty,
        medianFirstActionMinutes: null,
      },
      coverage: {
        accounts: 0,
        excludedTestAccounts: 0,
        untimedReviewAccounts: 0,
        phoneOnlyAccounts: 0,
      },
      bySource: [],
      bySignupPlatform: [],
    });
  });
});
