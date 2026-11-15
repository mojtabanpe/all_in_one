import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ClassifyExpenseInput,
  ClassifyExpenseResult,
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreateExpensesBatchInput,
  ExpenseCategoryItem,
  ExpenseItem,
  ExpenseQueryInput,
  ExpenseReport,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from '@all-in-one/applets/expenses/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly http = inject(HttpClient);
  readonly base = `${inject(API_BASE_URL)}/expenses`;

  listCategories(): Promise<ExpenseCategoryItem[]> {
    return firstValueFrom(
      this.http.get<ExpenseCategoryItem[]>(`${this.base}/categories`),
    );
  }

  createCategory(
    input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategoryItem> {
    return firstValueFrom(
      this.http.post<ExpenseCategoryItem>(`${this.base}/categories`, input),
    );
  }

  updateCategory(
    id: string,
    input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategoryItem> {
    return firstValueFrom(
      this.http.put<ExpenseCategoryItem>(
        `${this.base}/categories/${id}`,
        input,
      ),
    );
  }

  deleteCategory(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(`${this.base}/categories/${id}`),
    );
  }

  classify(input: ClassifyExpenseInput): Promise<ClassifyExpenseResult> {
    return firstValueFrom(
      this.http.post<ClassifyExpenseResult>(`${this.base}/classify`, input),
    );
  }

  list(query?: ExpenseQueryInput): Promise<ExpenseItem[]> {
    let params = new HttpParams();
    if (query?.from) params = params.set('from', query.from);
    if (query?.to) params = params.set('to', query.to);
    if (query?.preset) params = params.set('preset', query.preset);
    if (query?.categoryId) params = params.set('categoryId', query.categoryId);
    if (query?.search) params = params.set('search', query.search);
    if (query?.limit) params = params.set('limit', String(query.limit));

    return firstValueFrom(this.http.get<ExpenseItem[]>(this.base, { params }));
  }

  create(input: CreateExpenseInput): Promise<ExpenseItem> {
    return firstValueFrom(this.http.post<ExpenseItem>(this.base, input));
  }

  createBatch(input: CreateExpensesBatchInput): Promise<ExpenseItem[]> {
    return firstValueFrom(
      this.http.post<ExpenseItem[]>(`${this.base}/batch`, input),
    );
  }

  update(id: string, input: UpdateExpenseInput): Promise<ExpenseItem> {
    return firstValueFrom(
      this.http.put<ExpenseItem>(`${this.base}/${id}`, input),
    );
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(`${this.base}/${id}`),
    );
  }

  getReport(query?: ExpenseQueryInput): Promise<ExpenseReport> {
    let params = new HttpParams();
    if (query?.from) params = params.set('from', query.from);
    if (query?.to) params = params.set('to', query.to);
    if (query?.preset) params = params.set('preset', query.preset);
    if (query?.categoryId) params = params.set('categoryId', query.categoryId);

    return firstValueFrom(
      this.http.get<ExpenseReport>(`${this.base}/report`, { params }),
    );
  }
}
