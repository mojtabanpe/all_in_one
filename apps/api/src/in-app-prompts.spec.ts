import type { SmsService } from '@all-in-one/api/auth';
import type { PrismaService } from '@all-in-one/api/db';
import type { BillingService } from './billing/billing.service';
import { InAppPrompts, PROMPT_TTL_MS } from './in-app-prompts';
import type { TelegramService } from './telegram/telegram.service';

const now = new Date('2026-11-19T08:00:00Z');

function setup(over: { used?: string[]; recent?: boolean; age?: number } = {}) {
  const db = {
    inAppNotification: {
      findFirst: vi.fn().mockResolvedValue(over.recent ? { id: 'x' } : null),
      findMany: vi
        .fn()
        .mockResolvedValue((over.used ?? []).map((key) => ({ key }))),
      upsert: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        role: 'CUSTOMER',
        createdAt: new Date(now.getTime() - (over.age ?? 5) * 86_400_000),
        email: 'a@b.test',
        emailVerifiedAt: now,
        phone: null,
        phoneVerifiedAt: null,
        enabledApplets: ['planner', 'english', 'health'],
      }),
    },
    pushSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    telegramLink: { findUnique: vi.fn().mockResolvedValue(null) },
    plannerTask: { findFirst: vi.fn().mockResolvedValue(null) },
    healthProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    mealLog: { count: vi.fn().mockResolvedValue(0) },
    englishCard: { count: vi.fn().mockResolvedValue(0) },
    englishReviewDay: { findFirst: vi.fn().mockResolvedValue(null) },
    mcpKey: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const billing = { rewardOffers: vi.fn().mockResolvedValue([]) };
  const prompts = new InAppPrompts(
    db as unknown as PrismaService,
    billing as unknown as BillingService,
    { enabled: true } as unknown as SmsService,
    { enabled: true } as unknown as TelegramService,
  );
  const created = () =>
    db.inAppNotification.upsert.mock.calls.map(
      ([arg]) => arg.create as { key: string; content: { widget: unknown } },
    );
  return { db, prompts, created };
}
const active = (days: number) => () => Promise.resolve(days);

describe('in-app prompts (hard steps done in a bottom sheet)', () => {
  it('offers the first missing step, once, as a week-long prompt', async () => {
    const { db, prompts, created } = setup();
    await prompts.offer('u', now, active(3));
    expect(created()).toEqual([
      expect.objectContaining({
        key: 'prompt:push',
        source: 'prompt',
        content: expect.objectContaining({ widget: { kind: 'push' } }),
        expiresAt: new Date(now.getTime() + PROMPT_TTL_MS),
      }),
    ]);
    expect(db.inAppNotification.upsert).toHaveBeenCalledTimes(1);
  });

  it('never asks again after a prompt of that kind, and moves to the next step', async () => {
    const { prompts, created } = setup({ used: ['prompt:push'] });
    await prompts.offer('u', now, active(3));
    expect(created().map((c) => c.key)).toEqual(['prompt:telegram']);
  });

  it('waits while another notice is open or a prompt was shown recently', async () => {
    const { db, prompts } = setup({ recent: true });
    await prompts.offer('u', now, active(9));
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.inAppNotification.upsert).not.toHaveBeenCalled();
  });

  it('asks nothing before the account has really used the app', async () => {
    const young = setup({ age: 0.5 });
    await young.prompts.offer('u', now, active(9));
    const idle = setup();
    await idle.prompts.offer('u', now, active(1));
    expect(young.db.inAppNotification.upsert).not.toHaveBeenCalled();
    expect(idle.db.inAppNotification.upsert).not.toHaveBeenCalled();
  });

  it('suggests a daily repeat for a one-off task added on several days, with its title', async () => {
    const { db, prompts, created } = setup({
      used: ['prompt:push', 'prompt:telegram', 'prompt:phone'],
    });
    db.$queryRaw.mockResolvedValueOnce([{ title: ' ورزش صبح ' }]);
    await prompts.offer('u', now, active(3));
    const [prompt] = created();
    expect(prompt.key).toMatch(/^prompt:repeat:[0-9a-f]{16}$/);
    expect(prompt.content.widget).toEqual({
      kind: 'repeat-task',
      data: { title: 'ورزش صبح' },
    });
  });

  it('offers five quick cards only when cards wait and nothing was reviewed for days', async () => {
    const used = ['prompt:push', 'prompt:telegram', 'prompt:phone'];
    const { db, prompts, created } = setup({ used });
    db.englishCard.count.mockResolvedValue(12);
    await prompts.offer('u', now, active(3));
    expect(created()[0].key).toBe('prompt:review:2026-11-19');

    const fresh = setup({ used });
    fresh.db.englishCard.count.mockResolvedValue(12);
    fresh.db.englishReviewDay.findFirst.mockResolvedValue({ userId: 'u' });
    await fresh.prompts.offer('u', now, active(3));
    expect(fresh.db.inAppNotification.upsert).not.toHaveBeenCalled();
  });
});
