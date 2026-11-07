import type { OnboardingGoal } from './onboarding';
import * as z from 'zod/mini';

export const GROWTH_EVENTS = ['landing_view', 'signup_started'] as const;
const campaignValue = z.string().check(
  z.minLength(1),
  z.maxLength(200),
  z.refine(
    (value) =>
      !Array.from(value).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ),
  ),
);

export const GROWTH_CAMPAIGN_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
export const growthCampaignSchema = z.strictObject({
  utm_source: z.optional(campaignValue),
  utm_medium: z.optional(campaignValue),
  utm_campaign: z.optional(campaignValue),
  utm_term: z.optional(campaignValue),
  utm_content: z.optional(campaignValue),
});
export type GrowthCampaign = z.infer<typeof growthCampaignSchema>;

/** URL handoff never forwards a token, redirect, visitor ID or arbitrary query. */
export function extractGrowthCampaign(params: {
  get(key: string): string | null;
}): GrowthCampaign {
  const campaign: GrowthCampaign = {};
  for (const key of GROWTH_CAMPAIGN_KEYS) {
    const parsed = campaignValue.safeParse(params.get(key));
    if (parsed.success) campaign[key] = parsed.data;
  }
  return campaign;
}

/** No arbitrary properties, page URLs, referrers or user-authored content. */
export const growthEventSchema = z.strictObject({
  visitorId: z.string().check(z.uuid()),
  name: z.enum(GROWTH_EVENTS),
  language: z.enum(['fa', 'en']),
  campaign: z.optional(growthCampaignSchema),
});
export type GrowthEventInput = z.infer<typeof growthEventSchema>;
/** Optional attribution only; the server decides whether registration succeeded. */
export const growthAttributionSchema = z.omit(growthEventSchema, {
  name: true,
});
export type GrowthAttribution = z.infer<typeof growthAttributionSchema>;
export interface GrowthSummary {
  onboarding: {
    accounts: number;
    skippedAccounts: number;
    unselectedAccounts: number;
    goals: {
      goal: OnboardingGoal;
      selectedAccounts: number;
      completedAccounts: number;
    }[];
  };
  retention: {
    day: number;
    eligibleVisitors: number;
    returnedVisitors: number;
  }[];
  activity: {
    dailyVisitors: number;
    weeklyVisitors: number;
    monthlyVisitors: number;
    eligibleSignupVisitors: number;
    threeDaySignupVisitors: number;
  };
  windowDays: number;
  landingVisitors: number;
  signupVisitors: number;
  completedSignupVisitors: number;
  firstTaskVisitors: number;
  firstReviewVisitors: number;
  channels: GrowthChannel[];
}

export interface GrowthChannel {
  source: string;
  medium: string;
  landingVisitors: number;
  signupVisitors: number;
  completedSignupVisitors: number;
  activatedVisitors: number;
}

/** Exact first-touch campaign filters; empty form controls are omitted. */
export const GROWTH_CAMPAIGN_WINDOWS = ['7', '30', '90'] as const;

export const growthCampaignFilterSchema = z
  .strictObject({
    days: z.optional(z.enum(GROWTH_CAMPAIGN_WINDOWS)),
    from: z.optional(z.iso.date()),
    to: z.optional(z.iso.date()),
    source: z.optional(campaignValue),
    medium: z.optional(campaignValue),
    campaign: z.optional(campaignValue),
  })
  .check(
    z.refine(({ days, from, to }) =>
      from || to ? !days && !!from && !!to && from <= to : true,
    ),
  );
export type GrowthCampaignFilter = z.infer<typeof growthCampaignFilterSchema>;
export interface GrowthCampaignMetrics {
  landingVisitors: number;
  signupVisitors: number;
  completedSignupVisitors: number;
  activeVisitors: number;
}
export interface GrowthCampaignReport {
  windowDays: number;
  from: string;
  to: string;
  totals: GrowthCampaignMetrics;
  rows: (GrowthCampaignMetrics & {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  })[];
}
