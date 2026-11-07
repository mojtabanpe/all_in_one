import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  AI_KINDS,
  aiCostUsd,
  type AiCostReport,
  type AiKind,
  type AiUsageOverview,
  type AiUsageView,
  type BillingAccessState,
} from '@all-in-one/shared/schemas';
import { AiSettingsService } from './ai-settings.service';

type Tier = BillingAccessState['tier'];

const tehranDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's Tehran calendar day as YYYY-MM-DD. */
export function usageDay(now = new Date()): string {
  return tehranDay.format(now);
}

export const AI_QUOTA_MESSAGE: Record<AiKind, string> = {
  chat: 'سهمیهٔ امروزِ گفتگو با هوش مصنوعی تمام شد؛ فردا دوباره در دسترس است.',
  tts: 'سهمیهٔ امروزِ تبدیل متن به گفتار تمام شد؛ فردا دوباره در دسترس است.',
  stt: 'سهمیهٔ امروزِ تبدیل گفتار به متن تمام شد؛ فردا دوباره در دسترس است.',
};

/**
 * Daily AI quotas per access tier (admin-set, DEFAULT_AI_QUOTAS until then) and the use behind them, per
 * account and Tehran day. A request is let in while the day's use is under the limit and recorded after it
 * succeeds, so one request can end slightly over the limit; failed requests are not counted.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
  ) {}

  private async limit(tier: Tier, kind: AiKind): Promise<number | null> {
    if (tier === 'staff' || tier === 'free') return null;
    return (await this.settings.quotas())[tier][kind];
  }

  /** Throws 429 `AI_QUOTA_REACHED` when today's use (plus `extra`) passes the tier's limit. */
  async check(
    userId: string,
    tier: Tier,
    kind: AiKind,
    extra = 0,
    now = new Date(),
  ): Promise<void> {
    const limit = await this.limit(tier, kind);
    if (limit === null) return;
    const row = await this.prisma.aiUsageDay.findUnique({
      where: {
        userId_day_kind: {
          userId,
          day: new Date(usageDay(now)),
          kind,
        },
      },
      select: { units: true },
    });
    const used = row?.units ?? 0;
    if (used >= limit || (extra > 0 && used + extra > limit))
      throw new HttpException(
        {
          code: 'AI_QUOTA_REACHED',
          kind,
          message: AI_QUOTA_MESSAGE[kind],
        },
        429,
      );
  }

  /**
   * Adds one call and its units (chat tokens, tts characters, one stt recording) to today's row; for chat
   * `outputUnits` are the output tokens among them (priced apart). The tier is kept for cost per plan.
   */
  async record(
    userId: string,
    kind: AiKind,
    units: number,
    options: { outputUnits?: number; tier?: Tier } = {},
    now = new Date(),
  ): Promise<void> {
    const day = usageDay(now);
    const amount = Math.max(0, Math.round(units));
    const output = Math.min(
      amount,
      Math.max(0, Math.round(options.outputUnits ?? 0)),
    );
    const tier = options.tier ?? null;
    await this.prisma.$executeRaw`
      INSERT INTO ai_usage_days ("userId", day, kind, calls, units, "outputUnits", tier)
      VALUES (${userId}::uuid, ${day}::date, ${kind}, 1, ${amount}, ${output}, ${tier})
      ON CONFLICT ("userId", day, kind)
      DO UPDATE SET calls = ai_usage_days.calls + 1,
        units = ai_usage_days.units + ${amount},
        "outputUnits" = ai_usage_days."outputUnits" + ${output},
        tier = COALESCE(${tier}, ai_usage_days.tier)
    `;
  }

  /**
   * What AI cost over the last `days` Tehran days (today included) at the admin's current prices, per service
   * and per access tier, with the cost per account per 30 days (the figure plan prices must cover). Costs are
   * estimates: chat tokens come from the service's own usage report, or a length estimate when it gives none.
   */
  async costs(days = 30, now = new Date()): Promise<AiCostReport> {
    const to = usageDay(now);
    const from = usageDay(new Date(now.getTime() - (days - 1) * 86_400_000));
    const prices = await this.settings.prices();
    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        kind: AiKind;
        tier: string | null;
        calls: bigint;
        units: bigint;
        output: bigint;
      }[]
    >`
      SELECT "userId"::text AS "userId", kind, tier,
        SUM(calls) AS calls, SUM(units) AS units, SUM("outputUnits") AS output
      FROM ai_usage_days WHERE day BETWEEN ${from}::date AND ${to}::date
      GROUP BY "userId", kind, tier
    `;
    const kinds = Object.fromEntries(
      AI_KINDS.map((kind) => [kind, { calls: 0, units: 0, usd: 0 }]),
    ) as AiCostReport['kinds'];
    const tiers = new Map<string, { users: Set<string>; usd: number }>();
    for (const row of rows) {
      const units = Number(row.units);
      const usd = aiCostUsd(prices, row.kind, units, Number(row.output));
      kinds[row.kind].calls += Number(row.calls);
      kinds[row.kind].units += units;
      kinds[row.kind].usd += usd;
      const tier = ['trial', 'earned', 'paid', 'staff'].includes(row.tier ?? '')
        ? (row.tier as string)
        : 'unknown';
      const entry = tiers.get(tier) ?? { users: new Set<string>(), usd: 0 };
      entry.users.add(row.userId);
      entry.usd += usd;
      tiers.set(tier, entry);
    }
    const order = ['paid', 'trial', 'earned', 'staff', 'unknown'];
    return {
      days,
      from,
      to,
      priced:
        prices.chatInput + prices.chatOutput + prices.tts + prices.stt > 0,
      usdToToman: prices.usdToToman,
      totalUsd: AI_KINDS.reduce((sum, kind) => sum + kinds[kind].usd, 0),
      kinds,
      tiers: [...tiers.entries()]
        .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
        .map(([tier, { users, usd }]) => ({
          tier: tier as AiCostReport['tiers'][number]['tier'],
          users: users.size,
          usd,
          usdPerUserMonth: users.size ? ((usd / users.size) * 30) / days : 0,
        })),
    };
  }

  /** The account's use today against its limits (shown on the subscription page). */
  async view(
    userId: string,
    tier: Tier,
    now = new Date(),
  ): Promise<AiUsageView> {
    const day = usageDay(now);
    const rows = await this.prisma.aiUsageDay.findMany({
      where: { userId, day: new Date(day) },
      select: { kind: true, units: true },
    });
    const kinds = {} as AiUsageView['kinds'];
    for (const kind of AI_KINDS)
      kinds[kind] = {
        used: rows.find((row) => row.kind === kind)?.units ?? 0,
        limit: tier === 'free' ? 0 : await this.limit(tier, kind),
      };
    return { day, kinds };
  }

  /** Today's totals for the admin page. */
  async overview(now = new Date()): Promise<AiUsageOverview> {
    const day = usageDay(now);
    const rows = await this.prisma.aiUsageDay.groupBy({
      by: ['kind'],
      where: { day: new Date(day) },
      _count: { userId: true },
      _sum: { calls: true, units: true },
    });
    const kinds = {} as AiUsageOverview['kinds'];
    for (const kind of AI_KINDS) {
      const row = rows.find((item) => item.kind === kind);
      kinds[kind] = {
        users: row?._count.userId ?? 0,
        calls: row?._sum.calls ?? 0,
        units: row?._sum.units ?? 0,
      };
    }
    return { day, kinds };
  }
}
