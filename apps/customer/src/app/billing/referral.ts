import { DOCUMENT } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
import { Component, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  GROWTH_REFERRAL_SOURCE,
  normalizeReferralCode,
  REFERRAL_PARAM,
  type ReferralStatus,
} from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioButton,
  AioCardDirectives,
  AioFormField,
  AioInput,
  AioLocale,
  AioNotifications,
  AioTranslate,
  verbatim,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  apiErrorMessage,
  AuthStore,
} from '@all-in-one/web/shared';

/** The code from an invitation link, kept until the account exists (directive 183). */
const STORED_CODE_KEY = 'aio-referral-code';

/**
 * Keeps the code of an invitation link (`?ref=`) through signup and sends it once the account is signed in.
 * Started by the app root; storage that cannot be used only loses the automatic step (the code can be typed).
 */
@Injectable({ providedIn: 'root' })
export class ReferralCapture {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);
  private readonly window = inject(DOCUMENT).defaultView;
  private sending = false;

  constructor() {
    effect(() => {
      if (this.auth.user()) void this.send();
    });
  }

  /** Called once by the app root, before signup can move away from the link. */
  start() {
    const code = normalizeReferralCode(
      new URLSearchParams(this.window?.location.search ?? '').get(
        REFERRAL_PARAM,
      ),
    );
    if (code) {
      this.write(code);
      if (this.auth.user()) void this.send();
    }
  }

  private async send() {
    const code = normalizeReferralCode(this.read());
    if (!code || this.sending) return;
    this.sending = true;
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/referral/attach`, { code }),
      );
      this.write(null);
    } catch (error) {
      // Offline: try again on the next sign-in. Anything else (used, too late, own code) is final.
      if (!(error instanceof HttpErrorResponse && error.status === 0))
        this.write(null);
    } finally {
      this.sending = false;
    }
  }

  private read(): string | null {
    try {
      return this.window?.localStorage.getItem(STORED_CODE_KEY) ?? null;
    } catch {
      return null;
    }
  }
  private write(code: string | null) {
    try {
      if (code) this.window?.localStorage.setItem(STORED_CODE_KEY, code);
      else this.window?.localStorage.removeItem(STORED_CODE_KEY);
    } catch {
      // Private mode or blocked storage.
    }
  }
}

/** Invite card (directive 183): the code, a link to share, and a field for a friend's code on new accounts. */
@Component({
  selector: 'customer-referral-card',
  imports: [
    AioAsyncButton,
    AioButton,
    AioCardDirectives,
    AioFormField,
    AioInput,
    AioTranslate,
  ],
  template: `
    <section aioCard aria-labelledby="referral-heading">
      <div aioCardHeader>
        <h2 id="referral-heading" aioCardTitle>
          {{ 'دعوت از دوستان' | aioTranslate }}
        </h2>
        <p aioCardDescription>
          {{
            'دوستت ثبت‌نام کند و اولین کارش را انجام دهد؛ هر دو یک هفته هوش مصنوعی می‌گیرید.'
              | aioTranslate
          }}
        </p>
      </div>
      <div aioCardContent class="flex flex-col gap-4">
        @if (status.hasValue()) {
          @let state = status.value();
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p class="flex items-baseline gap-2">
              <span class="text-sm text-muted-foreground">{{
                'کد دعوت' | aioTranslate
              }}</span>
              <bdi
                dir="ltr"
                lang="en"
                class="font-mono text-lg font-semibold tracking-widest"
                >{{ state.code }}</bdi
              >
            </p>
            <button
              aioBtn
              type="button"
              class="min-h-11 sm:ms-auto"
              [disabled]="!state.weeksLeft"
              (click)="share(state.code)"
            >
              {{ 'فرستادن لینک دعوت' | aioTranslate }}
            </button>
          </div>
          @if (state.invited) {
            <p class="text-sm" role="status">
              {{
                '{0} نفر با دعوت تو آمدند؛ {1} هفته گرفتی.'
                  | aioTranslate
                    : [
                        locale.number(state.invited),
                        locale.number(state.rewarded),
                      ]
              }}
            </p>
          }
          @if (!state.weeksLeft) {
            <p class="text-sm text-muted-foreground">
              {{ 'همهٔ هفته‌های دعوت را گرفته‌ای.' | aioTranslate }}
            </p>
          }
          @if (state.canEnter) {
            <form
              class="flex flex-col gap-3 sm:flex-row sm:items-end"
              (submit)="$event.preventDefault(); enter(friendCode.value)"
            >
              <aio-form-field
                class="min-w-0 flex-1"
                label="کد دعوت دوستت را داری؟"
                controlId="referral-friend-code"
              >
                <input
                  aioInput
                  #friendCode
                  id="referral-friend-code"
                  type="text"
                  dir="ltr"
                  lang="en"
                  autocomplete="off"
                  autocapitalize="characters"
                  maxlength="12"
                  required
                />
              </aio-form-field>
              <button
                aioAsyncButton
                type="submit"
                label="ثبت کد"
                class="min-h-11"
                [busy]="entering()"
              ></button>
            </form>
          }
        } @else if (status.error()) {
          <p class="text-sm text-destructive" role="alert">
            {{ 'لینک دعوت آماده نشد.' | aioTranslate }}
          </p>
        } @else {
          <div class="h-11 animate-pulse rounded-xl bg-muted"></div>
        }
      </div>
    </section>
  `,
})
export class ReferralCard {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly window = inject(DOCUMENT).defaultView;
  protected readonly status = httpResource<ReferralStatus>(
    () => `${this.api}/referral`,
  );
  protected readonly entering = signal(false);

  /** The public home page with the code; its signup links carry the code into the app. */
  protected link(code: string): string {
    const url = new URL(
      '/',
      this.window?.location.origin ?? 'https://poshtetgarm.ir',
    );
    url.search = new URLSearchParams({
      ref: code,
      utm_source: GROWTH_REFERRAL_SOURCE,
      utm_medium: 'invite',
      utm_campaign: 'referral',
    }).toString();
    return url.href;
  }

  protected async share(code: string) {
    const url = this.link(code);
    // The code is in the text too: installs from Cafe Bazaar or Myket lose the link.
    const text = this.locale.text(
      'با Poshtetgarm کارها، زبان و سلامتت را مرتب کن. با کد دعوت {0} یک هفته هوش مصنوعی هدیه بگیر.',
      [verbatim(code)],
    );
    const navigator = this.window?.navigator;
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'Poshtetgarm', text, url });
        return;
      }
      if (!navigator?.clipboard) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(`${text}\n${url}`);
      this.notifications.success('لینک دعوت کپی شد.');
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return;
      this.notifications.info(
        this.locale.text('کد دعوت تو: {0}', [verbatim(code)]),
      );
    }
  }

  protected async enter(value: string) {
    if (this.entering()) return;
    const code = normalizeReferralCode(value);
    if (!code) {
      this.notifications.error('کد دعوت درست نیست.');
      return;
    }
    this.entering.set(true);
    try {
      this.status.set(
        await firstValueFrom(
          this.http.post<ReferralStatus>(`${this.api}/referral/attach`, {
            code,
          }),
        ),
      );
      this.notifications.success(
        'کد ثبت شد. با اولین کارت، هفتهٔ هدیه اضافه می‌شود.',
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.entering.set(false);
    }
  }
}
