import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  GenerateRoutineInput,
  SaveRoutineInput,
  WorkoutRoutine,
  LogSessionInput,
  ShoppingItem,
  SwapPlanMealInput,
  GeneratePlanInput,
  HealthProfile,
  HealthProfileInput,
  MealEstimate,
  MealLog,
  MealLogInput,
  MealPlan,
  WorkoutLog,
  WorkoutLogInput,
} from '@all-in-one/applets/health/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);
  readonly base = `${inject(API_BASE_URL)}/health`;

  generateRoutine(input: GenerateRoutineInput): Promise<WorkoutRoutine> {
    return firstValueFrom(
      this.http.post<WorkoutRoutine>(`${this.base}/routines/generate`, input),
    );
  }
  saveRoutine(id: string, input: SaveRoutineInput): Promise<WorkoutRoutine> {
    return firstValueFrom(
      this.http.put<WorkoutRoutine>(`${this.base}/routines/${id}`, input),
    );
  }
  removeRoutine(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/routines/${id}`),
    );
  }
  logSession(input: LogSessionInput): Promise<WorkoutLog> {
    return firstValueFrom(
      this.http.post<WorkoutLog>(`${this.base}/training-sessions`, input),
    );
  }
  shopping(): Promise<ShoppingItem[]> {
    return firstValueFrom(
      this.http.get<ShoppingItem[]>(`${this.base}/meal-plans/shopping-list`),
    );
  }
  swapMeal(input: SwapPlanMealInput): Promise<MealPlan> {
    return firstValueFrom(
      this.http.patch<MealPlan>(`${this.base}/meal-plans/current/meal`, input),
    );
  }

  saveProfile(input: HealthProfileInput): Promise<HealthProfile> {
    return firstValueFrom(
      this.http.put<HealthProfile>(`${this.base}/profile`, input),
    );
  }

  logWorkout(input: WorkoutLogInput): Promise<WorkoutLog> {
    return firstValueFrom(
      this.http.post<WorkoutLog>(`${this.base}/workouts`, input),
    );
  }

  removeWorkout(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/workouts/${id}`),
    );
  }

  estimateMeal(description: string): Promise<MealEstimate> {
    return firstValueFrom(
      this.http.post<MealEstimate>(`${this.base}/ai/estimate-meal`, {
        description,
      }),
    );
  }

  logMeal(input: MealLogInput): Promise<MealLog> {
    return firstValueFrom(this.http.post<MealLog>(`${this.base}/meals`, input));
  }

  removeMeal(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/meals/${id}`));
  }

  generatePlan(input: GeneratePlanInput): Promise<MealPlan> {
    return firstValueFrom(
      this.http.post<MealPlan>(`${this.base}/meal-plans`, input),
    );
  }
}

/** Badge colour for a meal score. */
export function scoreClass(score: number): string {
  if (score >= 75) return 'bg-success text-success-foreground';
  if (score >= 50) return 'bg-warning text-foreground';
  return 'bg-destructive text-white';
}
