import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CheckinInput,
  CreateCalendarInput,
  CreateCountdownInput,
  CreateFocusInput,
  CreateHabitInput,
  CreateListInput,
  CreateTaskInput,
  FolderInput,
  HabitSection,
  PlannerCalendar,
  PlannerComment,
  PlannerCountdown,
  PlannerFocus,
  PlannerFolder,
  PlannerHabit,
  PlannerList,
  PlannerListDetail,
  PlannerSection,
  PlannerTag,
  PlannerTask,
  TagInput,
  UpdateCalendarInput,
  UpdateCountdownInput,
  UpdateFocusInput,
  UpdateHabitInput,
  UpdateListInput,
  UpdateTagInput,
  UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

/** HTTP client for the planner api; GET urls are for `httpResource`. */
@Injectable({ providedIn: 'root' })
export class PlannerApi {
  private readonly http = inject(HttpClient);
  readonly base = `${inject(API_BASE_URL)}/planner`;

  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  private delete<T = void>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.base + path));
  }

  url(path: string, query: Record<string, string | undefined> = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, value);
    const qs = params.toString();
    return this.base + path + (qs ? `?${qs}` : '');
  }

  // ---- lists
  createList(input: CreateListInput): Promise<PlannerList> {
    return this.post('/lists', input);
  }
  updateList(id: string, input: UpdateListInput): Promise<PlannerList> {
    return this.patch(`/lists/${id}`, input);
  }
  removeList(id: string): Promise<void> {
    return this.delete(`/lists/${id}`);
  }
  addSection(listId: string, name: string): Promise<PlannerSection> {
    return this.post(`/lists/${listId}/sections`, { name });
  }
  renameSection(id: string, name: string): Promise<PlannerSection> {
    return this.patch(`/sections/${id}`, { name });
  }
  removeSection(id: string): Promise<void> {
    return this.delete(`/sections/${id}`);
  }
  addMember(listId: string, email: string): Promise<PlannerListDetail> {
    return this.post(`/lists/${listId}/members`, { email });
  }
  removeMember(listId: string, userId: string): Promise<void> {
    return this.delete(`/lists/${listId}/members/${userId}`);
  }
  createFolder(input: FolderInput): Promise<PlannerFolder> {
    return this.post('/folders', input);
  }
  renameFolder(id: string, name: string): Promise<PlannerFolder> {
    return this.patch(`/folders/${id}`, { name });
  }
  removeFolder(id: string): Promise<void> {
    return this.delete(`/folders/${id}`);
  }
  createTag(input: TagInput): Promise<PlannerTag> {
    return this.post('/tags', input);
  }
  updateTag(id: string, input: UpdateTagInput): Promise<PlannerTag> {
    return this.patch(`/tags/${id}`, input);
  }
  removeTag(id: string): Promise<void> {
    return this.delete(`/tags/${id}`);
  }

  // ---- tasks
  createTask(input: CreateTaskInput): Promise<PlannerTask> {
    return this.post('/tasks', input);
  }
  updateTask(id: string, input: UpdateTaskInput): Promise<PlannerTask> {
    return this.patch(`/tasks/${id}`, input);
  }
  trashTask(id: string): Promise<void> {
    return this.delete(`/tasks/${id}`);
  }
  restoreTask(id: string): Promise<PlannerTask> {
    return this.post(`/tasks/${id}/restore`);
  }
  purgeTask(id: string): Promise<void> {
    return this.delete(`/trash/${id}`);
  }
  emptyTrash(): Promise<void> {
    return this.delete('/trash');
  }
  addItem(taskId: string, title: string): Promise<PlannerTask> {
    return this.post(`/tasks/${taskId}/checklist`, { title });
  }
  updateItem(
    taskId: string,
    itemId: string,
    input: { title?: string; done?: boolean },
  ): Promise<PlannerTask> {
    return this.patch(`/tasks/${taskId}/checklist/${itemId}`, input);
  }
  removeItem(taskId: string, itemId: string): Promise<PlannerTask> {
    return this.delete(`/tasks/${taskId}/checklist/${itemId}`);
  }
  addComment(taskId: string, body: string): Promise<PlannerComment[]> {
    return this.post(`/tasks/${taskId}/comments`, { body });
  }
  removeComment(id: string): Promise<void> {
    return this.delete(`/comments/${id}`);
  }

  // ---- habits
  createHabit(input: CreateHabitInput): Promise<PlannerHabit> {
    return this.post('/habits', input);
  }
  updateHabit(id: string, input: UpdateHabitInput): Promise<PlannerHabit> {
    return this.patch(`/habits/${id}`, input);
  }
  removeHabit(id: string): Promise<void> {
    return this.delete(`/habits/${id}`);
  }
  createHabitSection(name: string): Promise<HabitSection> {
    return this.post('/habit-sections', { name });
  }
  checkin(id: string, input: CheckinInput): Promise<PlannerHabit> {
    return this.post(`/habits/${id}/checkins`, input);
  }

  // ---- focus, calendars, countdowns
  createFocus(input: CreateFocusInput): Promise<PlannerFocus> {
    return this.post('/focus', input);
  }
  updateFocus(id: string, input: UpdateFocusInput): Promise<PlannerFocus> {
    return this.patch(`/focus/${id}`, input);
  }
  removeFocus(id: string): Promise<void> {
    return this.delete(`/focus/${id}`);
  }
  createCalendar(input: CreateCalendarInput): Promise<PlannerCalendar> {
    return this.post('/calendars', input);
  }
  updateCalendar(
    id: string,
    input: UpdateCalendarInput,
  ): Promise<PlannerCalendar> {
    return this.patch(`/calendars/${id}`, input);
  }
  removeCalendar(id: string): Promise<void> {
    return this.delete(`/calendars/${id}`);
  }
  createCountdown(input: CreateCountdownInput): Promise<PlannerCountdown> {
    return this.post('/countdowns', input);
  }
  updateCountdown(
    id: string,
    input: UpdateCountdownInput,
  ): Promise<PlannerCountdown> {
    return this.patch(`/countdowns/${id}`, input);
  }
  removeCountdown(id: string): Promise<void> {
    return this.delete(`/countdowns/${id}`);
  }
}
