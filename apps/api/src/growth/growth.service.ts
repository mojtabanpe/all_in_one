import { Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  GrowthEventInput,
  GrowthSummary,
} from '@all-in-one/shared/schemas';

const WINDOW_DAYS = 30;
const dayAt = (date: Date) =>
  date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });

@Injectable()
export class GrowthService {
  constructor(private readonly prisma: PrismaService) {}

  async recordMilestone(
    visitorId: string,
    name: 'first_task_created' | 'first_review_completed',
    language: 'fa' | 'en',
  ) {
    await this.prisma.growthEvent.createMany({
      data: [
        {
          visitorId,
          name,
          language,
          day: dayAt(new Date()),
          milestoneKey: `${visitorId}:${name}`,
        },
      ],
      skipDuplicates: true,
    });
  }

  /** One content-free active-day marker, optionally with a first-action milestone. */
  async recordActivity(
    visitorId: string,
    language: 'fa' | 'en',
    milestone?: 'first_task_created' | 'first_review_completed',
  ): Promise<void> {
    const base = { visitorId, language, day: dayAt(new Date()) };
    await this.prisma.growthEvent.createMany({
      data: [
        { ...base, name: 'active_day' },
        ...(milestone
          ? [
              {
                ...base,
                name: milestone,
                milestoneKey: `${visitorId}:${milestone}`,
              },
            ]
          : []),
      ],
      skipDuplicates: true,
    });
  }

  async record(input: GrowthEventInput): Promise<void> {
    await this.prisma.growthEvent.createMany({
      data: [
        {
          visitorId: input.visitorId,
          name: input.name,
          language: input.language,
          day: dayAt(new Date()),
          ...(input.campaign ? { campaign: input.campaign } : {}),
        },
      ],
      skipDuplicates: true,
    });
  }

  async summary(): Promise<GrowthSummary> {
    const since = dayAt(new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000));
    const until = dayAt(new Date());
    // Aggregate in the database; no visitor identifiers leave this service.
    const rows = await this.prisma.$queryRaw<
      { name: string; visitors: bigint }[]
    >`
      SELECT name, COUNT(DISTINCT "visitorId") AS visitors
      FROM growth_events WHERE day >= ${since} AND day <= ${until}
      GROUP BY name
    `;
    const count = (name: string) =>
      Number(rows.find((row) => row.name === name)?.visitors ?? 0);
    const channelRows = await this.prisma.$queryRaw<
      {
        source: string;
        medium: string;
        landing: bigint;
        started: bigint;
        completed: bigint;
        activated: bigint;
      }[]
    >`
      WITH events AS (
        SELECT * FROM growth_events WHERE day >= ${since} AND day <= ${until}
      ), first_touch AS (
        SELECT DISTINCT ON ("visitorId") "visitorId",
          COALESCE(NULLIF(campaign->>'utm_source', ''), 'direct') AS source,
          COALESCE(NULLIF(campaign->>'utm_medium', ''), 'unknown') AS medium
        FROM events ORDER BY "visitorId", "createdAt", id
      )
      SELECT f.source, f.medium,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'landing_view') AS landing,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'signup_started') AS started,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'signup_completed') AS completed,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name IN ('first_task_created', 'first_review_completed')) AS activated
      FROM events e JOIN first_touch f ON f."visitorId" = e."visitorId"
      GROUP BY f.source, f.medium ORDER BY landing DESC, completed DESC, f.source, f.medium LIMIT 20
    `;
    const [activity] = await this.prisma.$queryRaw<
      {
        daily: bigint;
        weekly: bigint;
        monthly: bigint;
        eligible: bigint;
        retained: bigint;
      }[]
    >`
      WITH active AS (
        SELECT "visitorId", day::date AS day FROM growth_events
        WHERE name = 'active_day' AND day >= ${since} AND day <= ${until}
      ), signups AS (
        SELECT "visitorId", MIN(day::date) AS day FROM growth_events
        WHERE name = 'signup_completed' AND day >= ${since} AND day <= ${until}
        GROUP BY "visitorId"
      ), mature AS (
        SELECT s."visitorId", COUNT(DISTINCT a.day) AS days
        FROM signups s LEFT JOIN active a ON a."visitorId" = s."visitorId"
          AND a.day >= s.day AND a.day < s.day + 7
        WHERE s.day <= ${until}::date - 7
        GROUP BY s."visitorId"
      )
      SELECT
        (SELECT COUNT(DISTINCT "visitorId") FROM active WHERE day = ${until}::date) AS daily,
        (SELECT COUNT(DISTINCT "visitorId") FROM active WHERE day >= ${until}::date - 6) AS weekly,
        (SELECT COUNT(DISTINCT "visitorId") FROM active) AS monthly,
        (SELECT COUNT(*) FROM mature) AS eligible,
        (SELECT COUNT(*) FROM mature WHERE days >= 3) AS retained
    `;
    return {
      activity: {
        dailyVisitors: Number(activity.daily),
        weeklyVisitors: Number(activity.weekly),
        monthlyVisitors: Number(activity.monthly),
        eligibleSignupVisitors: Number(activity.eligible),
        threeDaySignupVisitors: Number(activity.retained),
      },
      windowDays: WINDOW_DAYS,
      landingVisitors: count('landing_view'),
      signupVisitors: count('signup_started'),
      completedSignupVisitors: count('signup_completed'),
      firstTaskVisitors: count('first_task_created'),
      firstReviewVisitors: count('first_review_completed'),
      channels: channelRows.map((row) => ({
        source: row.source,
        medium: row.medium,
        landingVisitors: Number(row.landing),
        signupVisitors: Number(row.started),
        completedSignupVisitors: Number(row.completed),
        activatedVisitors: Number(row.activated),
      })),
    };
  }
}
