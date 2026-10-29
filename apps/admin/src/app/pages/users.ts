import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import type { AdminUserList } from '@all-in-one/shared/schemas';
import { AioBadge, AioButton, AioTableDirectives } from '@all-in-one/ui';
import { API_BASE_URL, faDate, faNumber } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-users',
  imports: [AioBadge, AioButton, AioTableDirectives],
  template: `
    <div class="flex flex-col gap-4">
      <header class="flex items-end justify-between">
        <h1 class="text-2xl font-bold">کاربران</h1>
        <span class="text-muted-foreground text-sm"
          >{{ fa(list.value()?.total ?? 0) }} نفر</span
        >
      </header>
      <div aioTableContainer class="glass rounded-3xl p-2">
        <table aioTable>
          <thead aioTHead>
            <tr aioTr>
              <th aioTh>نام</th>
              <th aioTh>ایمیل</th>
              <th aioTh>نقش</th>
              <th aioTh>عضویت</th>
            </tr>
          </thead>
          <tbody aioTBody>
            @for (u of list.value()?.users ?? []; track u.id) {
              <tr aioTr>
                <td aioTd>{{ u.name ?? '—' }}</td>
                <td aioTd dir="ltr" class="text-end">{{ u.email }}</td>
                <td aioTd>
                  <span
                    aioBadge
                    [variant]="u.role === 'ADMIN' ? 'default' : 'secondary'"
                    >{{ u.role === 'ADMIN' ? 'مدیر' : 'مشتری' }}</span
                  >
                </td>
                <td aioTd>
                  {{
                    faDate(u.createdAt, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
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
          قبلی
        </button>
        <button
          aioBtn
          variant="outline"
          size="sm"
          [disabled]="page() * 50 >= (list.value()?.total ?? 0)"
          (click)="page.update((p) => p + 1)"
        >
          بعدی
        </button>
      </div>
    </div>
  `,
})
export class Users {
  private readonly api = inject(API_BASE_URL);
  protected readonly page = signal(1);
  protected readonly list = httpResource<AdminUserList>(
    () => `${this.api}/admin/users?page=${this.page()}`,
  );
  protected readonly faDate = faDate;
  protected readonly fa = (n: number) => faNumber(n);
}
