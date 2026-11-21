import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AdminUserList,
  AdminVpnFriendInput,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioBadge,
  AioButton,
  AioCheckbox,
  AioNotifications,
  AioTableDirectives,
  AioLocale,
  AioDatePipe,
} from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-users',
  imports: [
    AioDatePipe,
    AioBadge,
    AioButton,
    AioCheckbox,
    AioTableDirectives,
    AioTranslate,
  ],
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
              <th aioTh>{{ 'دسترسی خصوصی' | aioTranslate }}</th>
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
                <td aioTd>
                  @if (u.role === 'CUSTOMER') {
                    <label
                      class="flex min-h-11 w-fit items-center gap-2"
                      [for]="'vpn-friend-' + u.id"
                    >
                      <aio-checkbox
                        [inputId]="'vpn-friend-' + u.id"
                        [checked]="
                          u.vpnCanInvite &&
                          (friendChanges().get(u.id) ?? u.vpnFriend)
                        "
                        [disabled]="
                          !u.vpnCanInvite || friendChanges().has(u.id)
                        "
                        (checkedChange)="setFriend(u.id, $event)"
                      />
                      {{ 'آشنا' | aioTranslate }}
                      @if (!u.vpnCanInvite) {
                        <span class="text-muted-foreground text-xs">
                          {{ 'اشتراک فعال ندارد' | aioTranslate }}
                        </span>
                      }
                    </label>
                  }
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
  private readonly http = inject(HttpClient);
  private readonly notices = inject(AioNotifications);
  protected readonly friendChanges = signal(new Map<string, boolean>());
  protected readonly page = signal(1);
  protected readonly list = httpResource<AdminUserList>(
    () => `${this.api}/admin/users?page=${this.page()}`,
  );
  protected readonly fa = (n: number) => this.locale.number(n);

  protected async setFriend(id: string, enabled: boolean) {
    if (this.friendChanges().has(id)) return;
    this.friendChanges.update((changes) => new Map(changes).set(id, enabled));
    try {
      const body: AdminVpnFriendInput = { enabled };
      await firstValueFrom(
        this.http.put(`${this.api}/admin/users/${id}/vpn-friend`, body),
      );
      if (this.list.hasValue()) {
        this.list.value.update(
          (data) =>
            data && {
              ...data,
              users: data.users.map((user) =>
                user.id === id ? { ...user, vpnFriend: enabled } : user,
              ),
            },
        );
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 422) {
        this.notices.error('اشتراک پولی فعال لازم است.');
        this.list.reload();
      } else {
        this.notices.error('تغییر دسترسی خصوصی ذخیره نشد.');
      }
    } finally {
      this.friendChanges.update((changes) => {
        const updated = new Map(changes);
        updated.delete(id);
        return updated;
      });
    }
  }
}
