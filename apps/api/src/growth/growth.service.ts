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
    return {
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
