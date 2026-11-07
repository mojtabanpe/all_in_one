import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  GrowthEventInput,
  GrowthCampaignFilter,
  GrowthCampaignReport,
  GrowthSummary,
  GrowthRetentionCohort,
  GrowthChurnMetrics,
  GrowthChurnReport,
} from '@all-in-one/shared/schemas';
import { GROWTH_CHURN_DAYS } from '@all-in-one/shared/schemas';

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

  async campaigns(
    filter: GrowthCampaignFilter = {},
  ): Promise<GrowthCampaignReport> {
    const now = new Date();
    const presetDays = Number(filter.days ?? WINDOW_DAYS);
    const oldest = dayAt(new Date(now.getTime() - 89 * 86_400_000));
    const today = dayAt(now);
    const since =
      filter.from ??
      dayAt(new Date(now.getTime() - (presetDays - 1) * 86_400_000));
    const until = filter.to ?? today;
    if (since < oldest || until > today) {
      throw new BadRequestException('بازهٔ کمپین باید در ۹۰ روز گذشته باشد.');
    }
    const windowDays = (Date.parse(until) - Date.parse(since)) / 86_400_000 + 1;
    const rows = await this.prisma.$queryRaw<
      {
        level: number;
        source: string | null;
        medium: string | null;
        campaign: string | null;
        landing: bigint;
        started: bigint;
        completed: bigint;
        active: bigint;
      }[]
    >`
      WITH events AS (
        SELECT * FROM growth_events WHERE day >= ${since} AND day <= ${until}
      ), first_touch AS (
        SELECT DISTINCT ON ("visitorId") "visitorId",
          NULLIF(campaign->>'utm_source', '') AS source,
          NULLIF(campaign->>'utm_medium', '') AS medium,
          NULLIF(campaign->>'utm_campaign', '') AS campaign
        FROM events ORDER BY "visitorId", "createdAt", id
      ), selected AS (
        SELECT * FROM first_touch
        -- Keep operational checks out of the campaign funnel, including later untagged activity.
        WHERE COALESCE(LOWER(source), '') NOT IN ('qa', 'test', 'roadmap_check')
          AND (${filter.source ?? null}::text IS NULL OR source = ${filter.source ?? null})
          AND (${filter.medium ?? null}::text IS NULL OR medium = ${filter.medium ?? null})
          AND (${filter.campaign ?? null}::text IS NULL OR campaign = ${filter.campaign ?? null})
      )
      SELECT GROUPING(f.source, f.medium, f.campaign) AS level,
        f.source, f.medium, f.campaign,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'landing_view') AS landing,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'signup_started') AS started,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name = 'signup_completed') AS completed,
        COUNT(DISTINCT e."visitorId") FILTER (WHERE e.name IN ('active_day', 'first_task_created', 'first_review_completed')) AS active
      FROM selected f JOIN events e ON e."visitorId" = f."visitorId"
      GROUP BY GROUPING SETS ((f.source, f.medium, f.campaign), ())
      ORDER BY level DESC, landing DESC, completed DESC,
        f.source NULLS LAST, f.medium NULLS LAST, f.campaign NULLS LAST LIMIT 21
    `;
    const metrics = (row?: (typeof rows)[number]) => ({
      landingVisitors: Number(row?.landing ?? 0),
      signupVisitors: Number(row?.started ?? 0),
      completedSignupVisitors: Number(row?.completed ?? 0),
      activeVisitors: Number(row?.active ?? 0),
    });
    return {
      windowDays,
      from: since,
      to: until,
      totals: metrics(rows.find((row) => row.level === 7)),
      rows: rows
        .filter((row) => row.level === 0)
        .map((row) => ({
          source: row.source,
          medium: row.medium,
          campaign: row.campaign,
          ...metrics(row),
        })),
    };
  }

  async retentionCohorts(now = new Date()): Promise<GrowthRetentionCohort[]> {
    const today = dayAt(now);
    const since = dayAt(new Date(now.getTime() - 89 * 86_400_000));
    const rows = await this.prisma.$queryRaw<
      {
        week: string;
        day: number;
        signups: bigint;
        eligible: bigint;
        returned: bigint;
      }[]
    >`
      WITH signups AS (
        SELECT e."visitorId", MIN(e.day::date) AS day
        FROM growth_events e
        WHERE e.name = 'signup_completed' AND e.day BETWEEN ${since} AND ${today}
          AND NOT EXISTS (
            SELECT 1 FROM growth_events qa WHERE qa."visitorId" = e."visitorId"
              AND LOWER(qa.campaign->>'utm_source') IN ('qa', 'test', 'roadmap_check')
          )
        GROUP BY e."visitorId"
      ), cohorts AS (
        SELECT *, day - ((EXTRACT(DOW FROM day)::int + 1) % 7) AS week
        FROM signups
      )
      SELECT c.week::text, d.day, COUNT(*) AS signups,
        COUNT(*) FILTER (WHERE c.day + d.day < ${today}::date) AS eligible,
        COUNT(a."visitorId") FILTER (WHERE c.day + d.day < ${today}::date) AS returned
      FROM cohorts c CROSS JOIN (VALUES (1), (7), (30)) AS d(day)
      LEFT JOIN growth_events a ON a."visitorId" = c."visitorId"
        AND a.name = 'active_day' AND a.day = (c.day + d.day)::text
      GROUP BY c.week, d.day ORDER BY c.week DESC, d.day
    `;
    const cohorts = new Map<string, GrowthRetentionCohort>();
    for (const row of rows) {
      const cohort = cohorts.get(row.week) ?? {
        week: row.week,
        signups: Number(row.signups),
        days: [],
      };
      cohort.days.push({
        day: row.day,
        eligible: Number(row.eligible),
        returned: Number(row.returned),
      });
      cohorts.set(row.week, cohort);
    }
    return [...cohorts.values()];
  }

  /**
   * Churn by acquisition channel: browsers that signed up in the retained 90 days, grouped by their first
   * observed source/medium (QA traffic excluded). A browser is judged once it signed up at least
   * GROWTH_CHURN_DAYS days ago: churned when it had no active day in the last GROWTH_CHURN_DAYS days (today
   * included), never active when it had none at all after signing up. Browsers, not people or accounts.
   */
  async churn(now = new Date()): Promise<GrowthChurnReport> {
    const today = dayAt(now);
    const since = dayAt(new Date(now.getTime() - 89 * 86_400_000));
    const rows = await this.prisma.$queryRaw<
      {
        level: number;
        source: string | null;
        medium: string | null;
        signups: bigint;
        mature: bigint;
        churned: bigint;
        never: bigint;
      }[]
    >`
      WITH first_touch AS (
        SELECT DISTINCT ON ("visitorId") "visitorId",
          COALESCE(NULLIF(campaign->>'utm_source', ''), 'direct') AS source,
          COALESCE(NULLIF(campaign->>'utm_medium', ''), 'unknown') AS medium
        FROM growth_events WHERE day <= ${today}
        ORDER BY "visitorId", "createdAt", id
      ), signups AS (
        SELECT e."visitorId", MIN(e.day::date) AS day
        FROM growth_events e
        WHERE e.name = 'signup_completed' AND e.day BETWEEN ${since} AND ${today}
          AND NOT EXISTS (
            SELECT 1 FROM growth_events qa WHERE qa."visitorId" = e."visitorId"
              AND LOWER(qa.campaign->>'utm_source') IN ('qa', 'test', 'roadmap_check')
          )
        GROUP BY e."visitorId"
      ), judged AS (
        SELECT f.source, f.medium,
          s.day <= ${today}::date - ${GROWTH_CHURN_DAYS}::int AS mature,
          EXISTS (
            SELECT 1 FROM growth_events a WHERE a."visitorId" = s."visitorId"
              AND a.name = 'active_day' AND a.day::date >= s.day AND a.day <= ${today}
          ) AS ever,
          EXISTS (
            SELECT 1 FROM growth_events a WHERE a."visitorId" = s."visitorId"
              AND a.name = 'active_day' AND a.day <= ${today}
              AND a.day::date > ${today}::date - ${GROWTH_CHURN_DAYS}::int
          ) AS recent
        FROM signups s JOIN first_touch f ON f."visitorId" = s."visitorId"
      )
      SELECT GROUPING(source, medium) AS level, source, medium,
        COUNT(*) AS signups,
        COUNT(*) FILTER (WHERE mature) AS mature,
        COUNT(*) FILTER (WHERE mature AND NOT recent) AS churned,
        COUNT(*) FILTER (WHERE mature AND NOT ever) AS never
      FROM judged
      GROUP BY GROUPING SETS ((source, medium), ())
      ORDER BY level DESC, signups DESC, source, medium LIMIT 21
    `;
    const metrics = (row?: (typeof rows)[number]): GrowthChurnMetrics => ({
      signups: Number(row?.signups ?? 0),
      mature: Number(row?.mature ?? 0),
      churned: Number(row?.churned ?? 0),
      neverActive: Number(row?.never ?? 0),
    });
    return {
      inactiveDays: GROWTH_CHURN_DAYS,
      from: since,
      to: today,
      totals: metrics(rows.find((row) => row.level === 3)),
      rows: rows
        .filter((row) => row.level === 0)
        .map((row) => ({
          source: row.source ?? 'direct',
          medium: row.medium ?? 'unknown',
          ...metrics(row),
        })),
    };
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
    // Each offset uses 30 fully observed return days, ending yesterday.
    // Earliest retained signup per browser prevents a second account from resetting the cohort.
    const retention = await this.prisma.$queryRaw<
      {
        day: number;
        eligible: bigint;
        returned: bigint;
      }[]
    >`
      WITH signups AS (
        SELECT "visitorId", MIN(day::date) AS day FROM growth_events
        WHERE name = 'signup_completed' AND day <= ${until}
        GROUP BY "visitorId"
      ), offsets AS (SELECT * FROM (VALUES (1), (7), (30)) AS d(day))
      SELECT d.day,
        COUNT(s."visitorId") AS eligible,
        COUNT(a."visitorId") AS returned
      FROM offsets d LEFT JOIN signups s
        ON s.day >= ${until}::date - d.day - 30
        AND s.day < ${until}::date - d.day
      LEFT JOIN growth_events a ON a."visitorId" = s."visitorId"
        AND a.name = 'active_day' AND a.day = (s.day + d.day)::text
      GROUP BY d.day ORDER BY d.day
    `;
    // Account totals stay aggregated and separate from pseudonymous browser events.
    const onboarding = await this.prisma.$queryRaw<
      {
        bucket: string;
        accounts: bigint;
        completed: bigint;
      }[]
    >`
      SELECT CASE
        WHEN "onboardingSkipped" THEN 'skipped'
        WHEN "onboardingGoal" IN ('planner', 'english', 'health') THEN "onboardingGoal"
        ELSE 'unselected' END AS bucket,
        COUNT(*) AS accounts,
        COUNT(*) FILTER (WHERE "onboardingCompletedAt" IS NOT NULL
          AND NOT "onboardingSkipped" AND "onboardingGoal" IN ('planner', 'english', 'health')) AS completed
      FROM users
      WHERE role = 'CUSTOMER'
        AND "createdAt" >= ((${since}::date::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC')
        AND "createdAt" < (((${until}::date + 1)::timestamp AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'UTC')
      GROUP BY bucket
    `;
    const bucketCount = (bucket: string) =>
      Number(onboarding.find((row) => row.bucket === bucket)?.accounts ?? 0);
    return {
      onboarding: {
        accounts: onboarding.reduce(
          (sum, row) => sum + Number(row.accounts),
          0,
        ),
        skippedAccounts: bucketCount('skipped'),
        unselectedAccounts: bucketCount('unselected'),
        goals: (['planner', 'english', 'health'] as const).map((goal) => ({
          goal,
          selectedAccounts: bucketCount(goal),
          completedAccounts: Number(
            onboarding.find((row) => row.bucket === goal)?.completed ?? 0,
          ),
        })),
      },
      retention: retention.map((row) => ({
        day: row.day,
        eligibleVisitors: Number(row.eligible),
        returnedVisitors: Number(row.returned),
      })),
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
