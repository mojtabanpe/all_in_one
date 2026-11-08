import * as z from 'zod/mini';
import { iranMobile } from './user';

/** Lowercase plan handle, e.g. `monthly`, `annual`. */
export const billingPlanCodeSchema = z
  .string()
  .check(z.regex(/^[a-z0-9][a-z0-9-]{0,31}$/));

export const billingCheckoutSchema = z.strictObject({
  plan: billingPlanCodeSchema,
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

/** Renewal opens this long before paid access ends (the SUBSCRIPTION_EXPIRING SMS goes out at the same time). */
export const BILLING_RENEW_WINDOW_MS = 3 * 86_400_000;

/** A plan can be bought without paid access, or in its last three days (directive 118). */
export function canBuyPlan(
  paidUntil: string | Date | null,
  now = new Date(),
): boolean {
  if (!paidUntil) return true;
  return (
    new Date(paidUntil).getTime() - now.getTime() <= BILLING_RENEW_WINDOW_MS
  );
}

/** Android store builds pay through the store's own in-app billing; the web and the direct APK use Zibal. */
export const BILLING_STORES = ['bazaar', 'myket'] as const;
export type BillingStore = (typeof BILLING_STORES)[number];

/**
 * A plan's store product ID (SKU). Store IDs allow letters, digits, `_` and `.`, so the plan code's `-` becomes
 * `_`; plan codes never contain `_`, so the mapping is reversible.
 */
export function billingStoreSku(code: string): string {
  return code.replaceAll('-', '_');
}
export function billingPlanCodeFromSku(sku: string): string {
  return sku.replaceAll('_', '-');
}

/** Before opening the store's purchase sheet: checks the plan and directive 118, returns the SKU and payload. */
export const billingStoreIntentSchema = z.strictObject({
  store: z.enum(BILLING_STORES),
  plan: billingPlanCodeSchema,
});
export type BillingStoreIntentInput = z.infer<typeof billingStoreIntentSchema>;
export interface BillingStoreIntent {
  sku: string;
  /** Sent as the purchase's developer payload; the server only accepts a purchase whose payload is this account's. */
  payload: string;
}

/** A finished store purchase, sent for server-side verification with the store's developer API. */
export const billingStoreVerifySchema = z.strictObject({
  store: z.enum(BILLING_STORES),
  sku: z.string().check(z.regex(/^[a-z0-9][a-z0-9_]{0,31}$/)),
  purchaseToken: z.string().check(z.regex(/^[A-Za-z0-9._:+/=-]{8,512}$/)),
});
export type BillingStoreVerifyInput = z.infer<typeof billingStoreVerifySchema>;

/** Admin create/update. Prices are Rial (Zibal's unit; 10 Rial = 1 Toman), whole Toman only. */
export const billingPlanInputSchema = z.strictObject({
  code: billingPlanCodeSchema,
  titleFa: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  titleEn: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  months: z.number().check(z.int(), z.minimum(1), z.maximum(24)),
  priceRial: z
    .number()
    .check(
      z.int(),
      z.minimum(10_000),
      z.maximum(2_000_000_000),
      z.multipleOf(10),
    ),
  active: z.boolean(),
});
export type BillingPlanInput = z.infer<typeof billingPlanInputSchema>;
export type BillingPlan = BillingPlanInput;

export interface BillingAccessState {
  /** `staff`: an admin account, which always has AI. */
  tier: 'free' | 'trial' | 'earned' | 'paid' | 'staff';
  trialUntil: string | null;
  earnedUntil: string | null;
  paidUntil: string | null;
  /**
   * End of all AI access already granted, counting weeks queued after the trial or paid time (they follow one
   * another); null without any. Lets the billing page show a week that starts later (directives 108, 121).
   */
  aiUntil: string | null;
}

export interface BillingSubscriptionState {
  /** ISO time; null when the account never paid. */
  paidUntil: string | null;
  active: boolean;
}

/** `REFUNDED`: the whole amount went back; a partial refund leaves the order `PAID` with `refundedRial`. */
export type BillingOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface BillingOrderSummary {
  id: string;
  plan: string;
  months: number;
  amountRial: number;
  status: BillingOrderStatus;
  refNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Money returned for this order, if any. */
  refundedRial: number | null;
}

/** Where the callback sends the browser back to: `/billing?payment=…`. */
export type BillingReturnStatus = 'paid' | 'failed' | 'pending';

export const billingAdminOrdersQuerySchema = z.strictObject({
  status: z.optional(z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED'])),
  page: z.optional(
    z.coerce.number().check(z.int(), z.minimum(1), z.maximum(10_000)),
  ),
});
export type BillingAdminOrdersQuery = z.infer<
  typeof billingAdminOrdersQuerySchema
>;

export type BillingProvider = 'ZIBAL' | 'BAZAAR' | 'MYKET';

export interface BillingAdminOrder extends BillingOrderSummary {
  email: string;
  trackId: string | null;
  provider: BillingProvider;
}

export interface BillingAdminOverview {
  /** Accounts whose paid access has not ended. */
  activeSubscribers: number;
  /** Last 30 days. */
  paidOrders: number;
  paidRial: number;
  /** Refunds recorded in the last 30 days, whichever month the order was paid. */
  refunds: number;
  refundedRial: number;
  /** Orders created in the last 30 days with a gateway tracking ID. */
  gatewayOrders: number;
  failedOrders: number;
  pendingOrders: number;
}

/** Subscription health for admins. Money is Rial; windows are the last 30 days. */
export interface BillingMetrics {
  /** Accounts whose paid access has not ended (payments and manual extensions). */
  paidUsers: number;
  /** Of those, accounts whose access comes only from manual extensions (no paid order behind it). */
  manualPaidUsers: number;
  /**
   * Monthly recurring revenue: for each paying account, its latest paid order's amount (minus any refund)
   * divided by the order's months. Manual extensions add nothing.
   */
  mrrRial: number;
  /** Accounts whose first paid order is in the window. */
  newPaidUsers: number;
  /** Paid orders in the window from accounts that had paid before. */
  renewals: number;
  /** Accounts whose paid access ended in the window and has not been renewed. */
  endedPaidUsers: number;
}

export interface BillingAdminOrderPage {
  orders: BillingAdminOrder[];
  total: number;
  overview: BillingAdminOverview;
}

/**
 * Admin account key: the account's email, or its confirmed mobile for a phone-only account (directive 119). The
 * field stays named `email` so existing admin requests keep working.
 */
const accountKey = z.string().check(
  z.trim(),
  z.maxLength(254),
  z.refine(
    (value) => iranMobile(value) !== null || /^\S+@\S+\.\S+$/.test(value),
    'ایمیل یا شمارهٔ موبایل حساب را وارد کن.',
  ),
);

export const billingAccountQuerySchema = z.strictObject({ email: accountKey });
export type BillingAccountQuery = z.infer<typeof billingAccountQuerySchema>;

const adjustmentReason = z
  .string()
  .check(z.trim(), z.minLength(3), z.maxLength(200));
/** Admin: extend someone's paid access by a number of days, or end it now. A reason is always recorded. */
export const billingAdjustmentSchema = z.discriminatedUnion('action', [
  z.strictObject({
    email: accountKey,
    action: z.literal('extend'),
    days: z.number().check(z.int(), z.minimum(1), z.maximum(366)),
    reason: adjustmentReason,
  }),
  z.strictObject({
    email: accountKey,
    action: z.literal('end'),
    reason: adjustmentReason,
  }),
]);
export type BillingAdjustmentInput = z.infer<typeof billingAdjustmentSchema>;

export interface BillingAdjustmentSummary {
  id: string;
  action: 'EXTEND' | 'END' | 'REFUND';
  days: number | null;
  reason: string;
  adminEmail: string;
  previousUntil: string | null;
  newUntil: string;
  createdAt: string;
}

/**
 * Admin: record money returned for a paid order (once per order). `remove` takes the order's months back
 * from the paid access (never before now); `keep` leaves access as it is (e.g. a goodwill partial refund).
 */
export const billingRefundSchema = z.strictObject({
  orderId: z.uuid(),
  amountRial: z
    .number()
    .check(z.int(), z.minimum(10), z.maximum(2_000_000_000), z.multipleOf(10)),
  access: z.enum(['remove', 'keep']),
  reason: adjustmentReason,
  reference: z.optional(
    z.string().check(z.trim(), z.maxLength(64), z.regex(/^[\w./-]*$/)),
  ),
});
export type BillingRefundInput = z.infer<typeof billingRefundSchema>;

/** Weeks support grants after checking a membership (directive 108); customers request these. */
export const SOCIAL_REWARD_CAMPAIGNS = [
  'TELEGRAM_JOIN',
  'INSTAGRAM_FOLLOW',
] as const;
/** Every week campaign; SECOND_CONTACT is granted automatically (directive 121). */
export const BILLING_REWARD_CAMPAIGNS = [
  ...SOCIAL_REWARD_CAMPAIGNS,
  'SECOND_CONTACT',
] as const;
export type BillingRewardCampaign = (typeof BILLING_REWARD_CAMPAIGNS)[number];

export const billingRewardSchema = z.strictObject({
  email: accountKey,
  campaign: z.enum(SOCIAL_REWARD_CAMPAIGNS),
  reason: adjustmentReason,
});
export type BillingRewardInput = z.infer<typeof billingRewardSchema>;

export const billingRewardRequestSchema = z.strictObject({
  campaign: z.enum(SOCIAL_REWARD_CAMPAIGNS),
  handle: z.string().check(z.trim(), z.regex(/^@?[a-zA-Z0-9_.]{1,30}$/)),
});
export type BillingRewardRequestInput = z.infer<
  typeof billingRewardRequestSchema
>;

export interface BillingRewardOffer {
  campaign: BillingRewardCampaign;
  /** The official page; empty for SECOND_CONTACT, which points at the account page instead. */
  url: string;
  status: 'available' | 'pending' | 'earned';
  /** SECOND_CONTACT: what the account still has to confirm. */
  confirm?: 'phone' | 'email';
}

export interface BillingPendingReward {
  id: string;
  campaign: BillingRewardCampaign;
  email: string;
  handle: string;
  createdAt: string;
}

export interface BillingRewardSummary {
  campaign: BillingRewardCampaign;
  startsAt: string;
  expiresAt: string;
  reason: string;
  adminEmail: string;
}

export interface BillingAccount {
  email: string;
  name: string | null;
  subscription: BillingSubscriptionState;
  orders: BillingOrderSummary[];
  adjustments: BillingAdjustmentSummary[];
  rewards: BillingRewardSummary[];
  refunds: BillingRefundSummary[];
}

export interface BillingRefundSummary {
  orderId: string;
  amountRial: number;
  reason: string;
  reference: string | null;
  adminEmail: string;
  createdAt: string;
}
