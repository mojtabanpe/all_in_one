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

export interface BillingSubscriptionState {
  /** ISO time; null when the account never paid. */
  paidUntil: string | null;
  active: boolean;
}

export type BillingOrderStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface BillingOrderSummary {
  id: string;
  plan: string;
  months: number;
  amountRial: number;
  status: BillingOrderStatus;
  refNumber: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Where the callback sends the browser back to: `/billing?payment=…`. */
export type BillingReturnStatus = 'paid' | 'failed' | 'pending';

export const billingAdminOrdersQuerySchema = z.strictObject({
  status: z.optional(z.enum(['PENDING', 'PAID', 'FAILED'])),
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
  failedOrders: number;
  pendingOrders: number;
}

export interface BillingAdminOrderPage {
  orders: BillingAdminOrder[];
  total: number;
  overview: BillingAdminOverview;
}
