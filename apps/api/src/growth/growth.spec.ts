import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, ROLES } from '@all-in-one/api/auth';
import {
  growthEventSchema,
  growthCampaignFilterSchema,
  growthClientVisitSchema,
} from '@all-in-one/shared/schemas';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';

const event = {
  visitorId: '019a59e3-4070-7000-8000-000000000001',
  name: 'landing_view',
  language: 'fa',
} as const;

describe('Growth data boundaries', () => {
  it('does not access storage or aggregates while the rollout is disabled', async () => {
    const record = vi.fn();
    const summary = vi.fn();
    const campaigns = vi.fn();
    const controller = new GrowthController(
      { record, summary, campaigns } as never,
      { get: () => 'false' } as never,
    );
    await expect(controller.record(event)).rejects.toThrow();
    expect(() => controller.summary({} as never)).toThrow();
    expect(() => controller.campaigns({} as never, {})).toThrow();
    await expect(
      controller.recordClient({ visitorId: event.visitorId, client: 'bazaar' }),
    ).rejects.toThrow();
    expect(() => controller.clients({} as never)).toThrow();
    expect(record).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
    expect(campaigns).not.toHaveBeenCalled();
  });
  it('rejects arbitrary/personal payload fields and fabricated completion events', () => {
    expect(growthEventSchema.safeParse(event).success).toBe(true);
    for (const name of [
      'pwa_install_prompt',
      'pwa_installed',
      'paywall_viewed',
    ])
      expect(growthEventSchema.safeParse({ ...event, name }).success).toBe(
        true,
      );
    for (const input of [
      { ...event, email: 'private@example.com' },
      { ...event, name: 'payment_verified' },
      { ...event, name: 'signup_completed' },
      { ...event, name: 'first_task_created' },
      { ...event, name: 'first_review_completed' },
      { ...event, name: 'active_day' },
      { ...event, visitorId: 'user-email@example.com' },
      { ...event, campaign: { password: 'secret' } },
      { ...event, campaign: { utm_source: 'x'.repeat(201) } },
      { ...event, campaign: { utm_source: 'a\nb' } },
    ])
      expect(growthEventSchema.safeParse(input).success).toBe(false);
  });

  it('permits public writes but keeps aggregates admin-only', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC, GrowthController.prototype.record)).toBe(
      true,
    );
    expect(
      reflector.get(IS_PUBLIC, GrowthController.prototype.summary),
    ).toBeUndefined();
    expect(reflector.get(ROLES, GrowthController.prototype.summary)).toEqual([
      'ADMIN',
    ]);
    expect(
      reflector.get(IS_PUBLIC, GrowthController.prototype.recordClient),
    ).toBe(true);
    expect(reflector.get(ROLES, GrowthController.prototype.clients)).toEqual([
      'ADMIN',
    ]);
  });

  it('accepts only known clients and a random visitor ID, without personal data', () => {
    const input = { visitorId: event.visitorId, client: 'direct_apk' };
    expect(growthClientVisitSchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { ...input, client: 'other-store' },
      { ...input, visitorId: 'person@example.com' },
      { ...input, userId: event.visitorId },
      { ...input, userAgent: 'private device data' },
    ])
      expect(growthClientVisitSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates campaign filters and protects the campaign report for admins', () => {
    expect(growthCampaignFilterSchema.safeParse({}).success).toBe(true);
    expect(
      growthCampaignFilterSchema.safeParse({ source: 'a&b', campaign: 'alpha' })
        .success,
    ).toBe(true);
    for (const input of [
      { source: '' },
      { medium: 'x'.repeat(201) },
      { campaign: 'a\nb' },
      { source: ['a', 'b'] },
      { email: 'personal@example.invalid' },
    ]) {
      expect(growthCampaignFilterSchema.safeParse(input).success).toBe(false);
    }
    const reflector = new Reflector();
    expect(
      reflector.get(IS_PUBLIC, GrowthController.prototype.campaigns),
    ).toBeUndefined();
    expect(reflector.get(ROLES, GrowthController.prototype.campaigns)).toEqual([
      'ADMIN',
    ]);
  });
  it('uses server Tehran day and atomic duplicate skipping, without persisting private payload fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T21:00:00Z'));
    try {
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const service = new GrowthService({
        growthEvent: { createMany },
      } as never);
      await service.record(event);
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            visitorId: event.visitorId,
            name: event.name,
            language: 'fa',
            day: '2026-11-07',
          },
        ],
        skipDuplicates: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns only aggregate counts and labels the 30-day window', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { name: 'landing_view', visitors: 12n },
        { name: 'pwa_install_prompt', visitors: 2n },
        { name: 'pwa_installed', visitors: 1n },
        { name: 'paywall_viewed', visitors: 3n },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { daily: 0n, weekly: 0n, monthly: 0n, eligible: 0n, retained: 0n },
      ])
      .mockResolvedValueOnce([{ day: 1, eligible: 2n, returned: 1n }])
      .mockResolvedValueOnce([]);
    const summary = await new GrowthService({
      $queryRaw: query,
    } as never).summary();
    expect(summary).toEqual({
      onboarding: {
        accounts: 0,
        skippedAccounts: 0,
        unselectedAccounts: 0,
        goals: [
          {
            goal: 'planner',
            selectedAccounts: 0,
            firstGoalAccounts: 0,
            completedAccounts: 0,
            firstWeekEligibleAccounts: 0,
            firstWeekCompletedAccounts: 0,
          },
          {
            goal: 'english',
            selectedAccounts: 0,
            firstGoalAccounts: 0,
            completedAccounts: 0,
            firstWeekEligibleAccounts: 0,
            firstWeekCompletedAccounts: 0,
          },
          {
            goal: 'health',
            selectedAccounts: 0,
            firstGoalAccounts: 0,
            completedAccounts: 0,
            firstWeekEligibleAccounts: 0,
            firstWeekCompletedAccounts: 0,
          },
        ],
      },
      retention: [{ day: 1, eligibleVisitors: 2, returnedVisitors: 1 }],
      activity: {
        dailyVisitors: 0,
        weeklyVisitors: 0,
        monthlyVisitors: 0,
        eligibleSignupVisitors: 0,
        threeDaySignupVisitors: 0,
      },
      windowDays: 30,
      landingVisitors: 12,
      signupVisitors: 0,
      completedSignupVisitors: 0,
      firstTaskVisitors: 0,
      firstReviewVisitors: 0,
      pwaPromptVisitors: 2,
      pwaInstalledVisitors: 1,
      paywallVisitors: 3,
      channels: [],
    });
  });
});
