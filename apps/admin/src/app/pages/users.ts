import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ADMIN_USER_FILTERS,
  ADMIN_USER_ROLES,
  type AdminUserFilter,
  type AdminUserList,
  type AdminUserRoleFilter,
  type AdminVpnFriendInput,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioBadge,
  AioButton,
  AioCheckbox,
  AioFormField,
  AioInput,
  AioNotifications,
  AioSelectField,
  AioTableDirectives,
  AioLocale,
  AioDatePipe,
} from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'admin-users',
  imports: [
    AioDatePipe,
    AioBadge,
    AioButton,
    AioCheckbox,
    AioFormField,
    AioInput,
    AioSelectField,
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

      <form
        class="glass grid gap-3 rounded-2xl p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
        (submit)="$event.preventDefault(); applySearchNow()"
      >
        <aio-form-field
          [label]="'جستجو' | aioTranslate"
          controlId="users-search"
        >
          <input
            aioInput
            id="users-search"
            type="search"
            autocomplete="off"
            [placeholder]="'نام، ایمیل یا موبایل' | aioTranslate"
            [value]="searchDraft()"
            (input)="onSearchInput($event)"
          />
        </aio-form-field>

        <aio-select-field
          label="نقش"
          controlId="users-role"
          emptyLabel="همه"
          [options]="roles"
          [optionLabels]="roleLabels"
          [value]="role()"
          (valueChange)="setRole($event)"
        />

        <aio-select-field
          label="وضعیت"
          controlId="users-filter"
          emptyLabel="همه"
          [options]="filters"
          [optionLabels]="filterLabels"
          [value]="filter()"
          (valueChange)="setFilter($event)"
        />

        @if (hasFilters()) {
          <button
            aioBtn
            type="button"
            variant="outline"
            class="min-h-11"
            (click)="clearFilters()"
          >
            {{ 'پاک کردن فیلترها' | aioTranslate }}
          </button>
        }
      </form>

      @if (list.error()) {
        <div
          role="alert"
          class="glass flex flex-wrap items-center gap-3 rounded-2xl p-4"
        >
          <span>{{ 'فهرست کاربران دریافت نشد.' | aioTranslate }}</span>
          <button
            aioBtn
            type="button"
            variant="outline"
            class="min-h-11"
            (click)="list.reload()"
          >
            {{ 'تلاش دوباره' | aioTranslate }}
          </button>
        </div>
      } @else if (list.hasValue() && !list.value().users.length) {
        <p
          class="text-muted-foreground glass rounded-2xl p-6 text-center text-sm"
        >
          {{ 'کاربری با این مشخصات پیدا نشد.' | aioTranslate }}
        </p>
      } @else {
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
        <div class="flex items-center justify-center gap-2">
          <button
            aioBtn
            variant="outline"
            size="sm"
            class="min-h-11"
            [disabled]="page() === 1"
            (click)="page.update((p) => p - 1)"
          >
            {{ 'قبلی' | aioTranslate }}
          </button>
          <button
            aioBtn
            variant="outline"
            size="sm"
            class="min-h-11"
            [disabled]="page() * 50 >= (list.value()?.total ?? 0)"
            (click)="page.update((p) => p + 1)"
          >
            {{ 'بعدی' | aioTranslate }}
          </button>
        </div>
      }
    </div>
  `,
})
export class Users {
  protected readonly locale = inject(AioLocale);

  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notices = inject(AioNotifications);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles = ADMIN_USER_ROLES;
  protected readonly roleLabels: Record<AdminUserRoleFilter, string> = {
    CUSTOMER: 'مشتری',
    ADMIN: 'مدیر',
  };
  protected readonly filters = ADMIN_USER_FILTERS;
  protected readonly filterLabels: Record<AdminUserFilter, string> = {
    paid: 'اشتراک فعال',
    free: 'بدون اشتراک',
    vpn_friend: 'آشنا (وی‌پی‌ان)',
    vpn_eligible: 'واجد شرایط وی‌پی‌ان',
    telegram: 'متصل به تلگرام',
  };

  protected readonly friendChanges = signal(new Map<string, boolean>());
  protected readonly page = signal(1);
  protected readonly searchDraft = signal('');
  protected readonly query = signal('');
  protected readonly role = signal<AdminUserRoleFilter | ''>('');
  protected readonly filter = signal<AdminUserFilter | ''>('');
  protected readonly hasFilters = computed(
    () => !!this.searchDraft().trim() || !!this.role() || !!this.filter(),
  );

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly list = httpResource<AdminUserList>(() => {
    const params: Record<string, string | number> = { page: this.page() };
    const q = this.query();
    if (q) params['q'] = q;
    const role = this.role();
    if (role) params['role'] = role;
    const filter = this.filter();
    if (filter) params['filter'] = filter;
    return { url: `${this.api}/admin/users`, params };
  });
  protected readonly fa = (n: number) => this.locale.number(n);

  constructor() {
    this.destroyRef.onDestroy(() => this.clearSearchTimer());
  }

  protected onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.commitSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected applySearchNow() {
    this.clearSearchTimer();
    this.commitSearch(this.searchDraft());
  }

  protected setRole(value: string) {
    const next = ADMIN_USER_ROLES.includes(value as AdminUserRoleFilter)
      ? (value as AdminUserRoleFilter)
      : '';
    this.role.set(next);
    this.page.set(1);
  }

  protected setFilter(value: string) {
    const next = ADMIN_USER_FILTERS.includes(value as AdminUserFilter)
      ? (value as AdminUserFilter)
      : '';
    this.filter.set(next);
    this.page.set(1);
  }

  protected clearFilters() {
    this.clearSearchTimer();
    this.searchDraft.set('');
    this.query.set('');
    this.role.set('');
    this.filter.set('');
    this.page.set(1);
  }

  private commitSearch(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === this.query()) return;
    this.query.set(trimmed);
    this.page.set(1);
  }

  private clearSearchTimer() {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

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
