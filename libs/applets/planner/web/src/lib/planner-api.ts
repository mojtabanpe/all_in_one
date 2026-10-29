import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateTaskInput,
  PlannerTask,
  UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PlannerApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/planner/tasks`;

  tasksUrl(from: string, to: string): string {
    return `${this.base}?from=${from}&to=${to}`;
  }

  create(input: CreateTaskInput): Promise<PlannerTask> {
    return firstValueFrom(this.http.post<PlannerTask>(this.base, input));
  }

  update(id: string, input: UpdateTaskInput): Promise<PlannerTask> {
    return firstValueFrom(
      this.http.patch<PlannerTask>(`${this.base}/${id}`, input),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }
}
