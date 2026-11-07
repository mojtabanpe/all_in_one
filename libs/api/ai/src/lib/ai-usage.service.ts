import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  AI_KINDS,
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

  /** Adds one call and its units (chat tokens, tts characters, one stt recording) to today's row. */
  async record(
    userId: string,
    kind: AiKind,
    units: number,
    now = new Date(),
  ): Promise<void> {
    const day = usageDay(now);
    const amount = Math.max(0, Math.round(units));
    await this.prisma.$executeRaw`
      INSERT INTO ai_usage_days ("userId", day, kind, calls, units)
      VALUES (${userId}::uuid, ${day}::date, ${kind}, 1, ${amount})
      ON CONFLICT ("userId", day, kind)
      DO UPDATE SET calls = ai_usage_days.calls + 1, units = ai_usage_days.units + ${amount}
    `;
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
