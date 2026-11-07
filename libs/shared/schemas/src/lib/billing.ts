import * as z from 'zod/mini';

/** Lowercase plan handle, e.g. `monthly`, `annual`. */
export const billingPlanCodeSchema = z
  .string()
  .check(z.regex(/^[a-z0-9][a-z0-9-]{0,31}$/));

export const billingCheckoutSchema = z.strictObject({
  plan: billingPlanCodeSchema,
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

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

export interface BillingAdminOrder extends BillingOrderSummary {
  email: string;
  trackId: string | null;
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

export const billingAccountQuerySchema = z.strictObject({ email: z.email() });
export type BillingAccountQuery = z.infer<typeof billingAccountQuerySchema>;

const adjustmentReason = z
  .string()
  .check(z.trim(), z.minLength(3), z.maxLength(200));
/** Admin: extend someone's paid access by a number of days, or end it now. A reason is always recorded. */
export const billingAdjustmentSchema = z.discriminatedUnion('action', [
  z.strictObject({
    email: z.email(),
    action: z.literal('extend'),
    days: z.number().check(z.int(), z.minimum(1), z.maximum(366)),
    reason: adjustmentReason,
  }),
  z.strictObject({
    email: z.email(),
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

export const BILLING_REWARD_CAMPAIGNS = [
  'TELEGRAM_JOIN',
  'INSTAGRAM_FOLLOW',
] as const;
export type BillingRewardCampaign = (typeof BILLING_REWARD_CAMPAIGNS)[number];

export const billingRewardSchema = z.strictObject({
  email: z.email(),
  campaign: z.enum(BILLING_REWARD_CAMPAIGNS),
  reason: adjustmentReason,
});
export type BillingRewardInput = z.infer<typeof billingRewardSchema>;

export const billingRewardRequestSchema = z.strictObject({
  campaign: z.enum(BILLING_REWARD_CAMPAIGNS),
  handle: z.string().check(z.trim(), z.regex(/^@?[a-zA-Z0-9_.]{1,30}$/)),
});
export type BillingRewardRequestInput = z.infer<
  typeof billingRewardRequestSchema
>;

export interface BillingRewardOffer {
  campaign: BillingRewardCampaign;
  url: string;
  status: 'available' | 'pending' | 'earned';
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
