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

export interface AdminUserList {
  total: number;
  users: (User & { vpnFriend: boolean; vpnCanInvite: boolean })[];
}

export const adminVpnFriendSchema = z.object({ enabled: z.boolean() });
export type AdminVpnFriendInput = z.infer<typeof adminVpnFriendSchema>;
