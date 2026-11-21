import * as z from 'zod/mini';
import type { User } from './user';

/** Dashboard numbers for the admin app. */
export interface AdminStats {
  users: number;
  customers: number;
  admins: number;
  newUsersThisWeek: number;
  plannerTasks: number;
  englishCards: number;
  workouts: number;
  meals: number;
  mealPlans: number;
}

export const ADMIN_USER_ROLES = ['CUSTOMER', 'ADMIN'] as const;
export type AdminUserRoleFilter = (typeof ADMIN_USER_ROLES)[number];

export const ADMIN_USER_FILTERS = [
  'paid',
  'free',
  'vpn_friend',
  'vpn_eligible',
  'telegram',
] as const;
export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number];

export const adminUsersQuerySchema = z.strictObject({
  page: z.optional(
    z.coerce.number().check(z.int(), z.minimum(1), z.maximum(10_000)),
  ),
  q: z.optional(z.string().check(z.trim(), z.maxLength(120))),
  role: z.optional(z.enum(ADMIN_USER_ROLES)),
  filter: z.optional(z.enum(ADMIN_USER_FILTERS)),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export interface AdminUserList {
  total: number;
  users: (User & { vpnFriend: boolean; vpnCanInvite: boolean })[];
}

export const adminVpnFriendSchema = z.object({ enabled: z.boolean() });
export type AdminVpnFriendInput = z.infer<typeof adminVpnFriendSchema>;
