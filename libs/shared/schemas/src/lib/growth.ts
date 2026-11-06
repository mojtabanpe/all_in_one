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

/** No arbitrary properties, page URLs, referrers or user-authored content. */
export const growthEventSchema = z.strictObject({
  visitorId: z.string().check(z.uuid()),
  name: z.enum(GROWTH_EVENTS),
  language: z.enum(['fa', 'en']),
  campaign: z.optional(
    z.strictObject({
      utm_source: z.optional(campaignValue),
      utm_medium: z.optional(campaignValue),
      utm_campaign: z.optional(campaignValue),
      utm_term: z.optional(campaignValue),
      utm_content: z.optional(campaignValue),
    }),
  ),
});
export type GrowthEventInput = z.infer<typeof growthEventSchema>;
/** Optional attribution only; the server decides whether registration succeeded. */
export const growthAttributionSchema = z.omit(growthEventSchema, {
  name: true,
});
export type GrowthAttribution = z.infer<typeof growthAttributionSchema>;
export interface GrowthSummary {
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
