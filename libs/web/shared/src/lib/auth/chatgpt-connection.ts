import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  MCP_SCOPE_LABELS,
  MCP_SCOPES,
  type McpKeyInfo,
} from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioCardDirectives,
  AioConfirm,
  AioIcon,
  AioInput,
  AioTextarea,
  aioToast,
  provideIcons,
  AioFormField,
  AioCardHeading,
} from '@all-in-one/ui';
import { lucideCopy, lucideKeyRound, lucideTrash2 } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { faDate } from '../format/fa';
import { apiErrorMessage } from './auth.guards';

interface KeysResponse {
  serverUrl: string;
  keys: McpKeyInfo[];
}

/**
 * The ChatGPT connection (MCP): the server url to add in ChatGPT and the
 * personal tokens pasted on the consent page. A new token is shown once.
 */
@Component({
  selector: 'web-chatgpt-connection',
  imports: [
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioInput,
    AioTextarea,
    AioFormField,
    AioCardHeading,
  ],
  providers: [provideIcons({ lucideCopy, lucideKeyRound, lucideTrash2 })],
  template: `
    <section aioCard>
      <div
        aioCardHeading
        title="اتصال به ChatGPT"
        [level]="2"
        description="از داخل ChatGPT کارت انگلیسی بساز، متن ذخیره کن و کارها، عادت‌ها و تمرکزت را مدیریت کن."
      ></div>
      <div aioCardContent class="flex flex-col gap-4">
        <ol class="text-muted-foreground list-decimal space-y-1 ps-5 text-sm">
          <li>
            در ChatGPT یک «اتصال» (MCP سفارشی) با این نشانی بساز و احراز هویت را
            OAuth بگذار:
          </li>
        </ol>
        <div class="flex items-center gap-2">
          <code
            class="bg-muted flex-1 truncate rounded-xl px-3 py-2 text-sm"
            dir="ltr"
            >{{ serverUrl() }}</code
          >
          <button
            aioBtn
            variant="outline"
            size="icon"
            aria-label="کپی نشانی"
            (click)="copy(serverUrl())"
          >
            <aio-icon name="lucideCopy" size="sm" />
          </button>
        </div>
        <ol
          start="2"
          class="text-muted-foreground list-decimal space-y-1 ps-5 text-sm"
        >
          <li>
            اینجا یک کلید شخصی بساز و در صفحه تأییدی که ChatGPT باز می‌کند
            بگذار.
          </li>
        </ol>

        <form class="flex gap-2" (submit)="$event.preventDefault(); create()">
          <aio-form-field
            class="flex-1"
            label="نام کلید"
            controlId="mcp-name"
            labelClass="sr-only"
          >
            <input
              aioInput
              id="mcp-name"
              maxlength="80"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </aio-form-field>
          <button aioBtn type="submit" [disabled]="busy()">
            <aio-icon name="lucideKeyRound" size="sm" />
            ساخت کلید
          </button>
        </form>

        @if (fresh(); as token) {
          <aio-form-field
            class="bg-accent rounded-2xl p-3"
            label="کلید تازه؛ همین حالا کپی کن، دیگر نشان داده نمی‌شود"
            controlId="mcp-token"
          >
            <textarea
              aioTextarea
              id="mcp-token"
              rows="2"
              readonly
              dir="ltr"
              class="font-mono text-xs"
              [value]="token"
            ></textarea>
            <button
              aioBtn
              variant="outline"
              size="sm"
              class="self-start"
              (click)="copy(token)"
            >
              <aio-icon name="lucideCopy" size="sm" /> کپی کلید
            </button>
          </aio-form-field>
        }

        <ul class="divide-border/60 flex flex-col divide-y">
          @for (key of keys(); track key.id) {
            <li class="flex min-h-12 items-center gap-3 py-2 text-sm">
              <span class="flex-1">
                {{ key.name }}
                <span class="text-muted-foreground block text-xs">
                  {{ scopeSummary(key) }}، تا {{ date(key.expiresAt) }}
                </span>
              </span>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                [attr.aria-label]="'باطل کردن ' + key.name"
                (click)="revoke(key)"
              >
                <aio-icon name="lucideTrash2" size="sm" />
              </button>
            </li>
          } @empty {
            <li class="text-muted-foreground py-2 text-sm">
              هنوز کلیدی نساخته‌ای.
            </li>
          }
        </ul>
        <p class="text-muted-foreground text-xs">
          کلیدها ۹۰ روز اعتبار دارند. باطل کردن کلید، اتصال‌های ساخته‌شده با آن
          را هم قطع می‌کند.
        </p>
      </div>
    </section>
  `,
})
export class ChatGptConnection {
  private readonly http = inject(HttpClient);
  private readonly confirm = inject(AioConfirm);
  private readonly base = `${inject(API_BASE_URL)}/mcp/keys`;

  protected readonly name = signal('ChatGPT');
  protected readonly busy = signal(false);
  protected readonly fresh = signal<string | null>(null);

  private readonly res = httpResource<KeysResponse>(() => this.base);
  protected readonly keys = computed(() =>
    this.res.hasValue() ? this.res.value().keys : [],
  );
  protected readonly serverUrl = computed(() =>
    this.res.hasValue() ? this.res.value().serverUrl : '…',
  );

  protected date(iso: string) {
    return faDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected scopeSummary(key: McpKeyInfo) {
    return key.scopes.length === MCP_SCOPES.length
      ? 'همه دسترسی‌ها'
      : key.scopes.map((s) => MCP_SCOPE_LABELS[s]).join('، ');
  }

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      aioToast.success('کپی شد');
    } catch {
      aioToast.error('کپی نشد؛ دستی انتخاب کن.');
    }
  }

  protected async create() {
    const name = this.name().trim();
    if (!name) return;
    this.busy.set(true);
    try {
      const key = await firstValueFrom(
        this.http.post<McpKeyInfo & { token: string }>(this.base, { name }),
      );
      this.fresh.set(key.token);
      this.res.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(key: McpKeyInfo) {
    const ok = await this.confirm.ask({
      title: `کلید «${key.name}» باطل شود؟`,
      description: 'ChatGPT دیگر با این کلید به حسابت دسترسی ندارد.',
      confirmText: 'باطل کن',
      destructive: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.http.delete(`${this.base}/${key.id}`));
      this.fresh.set(null);
      this.res.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
