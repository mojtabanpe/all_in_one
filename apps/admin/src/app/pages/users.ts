import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import type { AdminUserList } from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioBadge,
  AioButton,
  AioTableDirectives,
  AioLocale,
  AioDatePipe,
} from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-users',
  imports: [AioDatePipe, AioBadge, AioButton, AioTableDirectives, AioTranslate],
  template: `
    <div class="flex flex-col gap-4">
      <header class="flex items-end justify-between">
        <h1 class="text-2xl font-bold">{{ 'کاربران' | aioTranslate }}</h1>
        <span class="text-muted-foreground text-sm">{{
          '{0} نفر' | aioTranslate: [fa(list.value()?.total ?? 0)]
        }}</span>
      </header>
      <div aioTableContainer class="glass rounded-3xl p-2">
        <table aioTable>
          <thead aioTHead>
            <tr aioTr>
              <th aioTh>{{ 'نام' | aioTranslate }}</th>
              <th aioTh>{{ 'ایمیل یا موبایل' | aioTranslate }}</th>
              <th aioTh>{{ 'نقش' | aioTranslate }}</th>
              <th aioTh>{{ 'عضویت' | aioTranslate }}</th>
            </tr>
          </thead>
          <tbody aioTBody>
            @for (u of list.value()?.users ?? []; track u.id) {
              <tr aioTr>
                <td aioTd>{{ u.name ?? '—' }}</td>
                <td aioTd dir="ltr" lang="en" class="text-end">
                  {{ u.email ?? u.phone ?? '—' }}
                </td>
                <td aioTd>
                  <span
                    aioBadge
                    [variant]="u.role === 'ADMIN' ? 'default' : 'secondary'"
                    >{{
                      (u.role === 'ADMIN' ? 'مدیر' : 'مشتری') | aioTranslate
                    }}</span
                  >
                </td>
                <td aioTd>
                  {{
                    u.createdAt
                      | aioDate
                        : {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          }
                      | aioTranslate
                  }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="flex justify-center gap-2">
        <button
          aioBtn
          variant="outline"
          size="sm"
          [disabled]="page() === 1"
          (click)="page.update((p) => p - 1)"
        >
          {{ 'قبلی' | aioTranslate }}
        </button>
        <button
          aioBtn
          variant="outline"
          size="sm"
          [disabled]="page() * 50 >= (list.value()?.total ?? 0)"
          (click)="page.update((p) => p + 1)"
        >
          {{ 'بعدی' | aioTranslate }}
        </button>
      </div>
    </div>
  `,
})
export class Users {
  protected readonly locale = inject(AioLocale);

  private readonly api = inject(API_BASE_URL);
  protected readonly page = signal(1);
  protected readonly list = httpResource<AdminUserList>(
    () => `${this.api}/admin/users?page=${this.page()}`,
  );
  protected readonly fa = (n: number) => this.locale.number(n);
}
