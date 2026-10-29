import type { User } from './user';

/** Dashboard numbers for the admin app. */
export interface AdminStats {
  users: number;
  customers: number;
  admins: number;
  newUsersThisWeek: number;
  plannerTasks: number;
  englishWordsInReview: number;
  workouts: number;
  meals: number;
  mealPlans: number;
}

export interface AdminUserList {
  total: number;
  users: User[];
}
