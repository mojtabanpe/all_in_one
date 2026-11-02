import { Directionality } from '@angular/cdk/bidi';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  EnvironmentProviders,
  effect,
  inject,
  Injectable,
  Pipe,
  PLATFORM_ID,
  provideAppInitializer,
  REQUEST,
  signal,
  untracked,
  type PipeTransform,
} from '@angular/core';
import {
  LANGUAGE_COOKIE,
  isAppLanguage,
  loadMessages,
  messagesLoaded,
  translateMessage,
  type AppLanguage,
} from '@all-in-one/localization';

@Injectable({ providedIn: 'root' })
export class AioLocale {
  private readonly document = inject(DOCUMENT);
  private readonly bidi = inject(Directionality);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly request = inject(REQUEST, { optional: true });
  private readonly selected = signal<AppLanguage>(this.readLanguage());
  readonly language = this.selected.asReadonly();
  readonly direction = computed(() =>
    this.language() === 'en' ? 'ltr' : 'rtl',
  );
  readonly english = computed(() => this.language() === 'en');
  /** Bumps when the lazily loaded message table arrives, so copy re-renders. */
  private readonly messages = signal(messagesLoaded());
  /** Resolves once the message table is in (English waits for it at startup). */
  readonly ready = loadMessages().then(() => this.messages.set(true));

  constructor() {
    const applyLanguage = () => {
      this.document.documentElement.lang = this.language();
      this.document.documentElement.dir = this.direction();
      this.document.title = 'Poshtetgarm';
      const direction = this.direction();
      untracked(() => {
        if (this.bidi.value !== direction) {
          this.bidi.valueSignal.set(direction);
          this.bidi.change.emit(direction);
        }
      });
    };
    applyLanguage();
    effect(applyLanguage);
    if (this.browser) {
      const sync = (event: StorageEvent) => {
        if (event.key === LANGUAGE_COOKIE && isAppLanguage(event.newValue))
          this.selected.set(event.newValue);
      };
      this.document.defaultView?.addEventListener('storage', sync);
      inject(DestroyRef).onDestroy(() =>
        this.document.defaultView?.removeEventListener('storage', sync),
      );
    }
  }
  private readLanguage(): AppLanguage {
    const cookie = this.browser
      ? this.document.cookie
      : (this.request?.headers.get('cookie') ?? '');
    const value = cookie
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(LANGUAGE_COOKIE + '='))
      ?.split('=')[1];
    if (isAppLanguage(value)) return value;
    if (this.browser) {
      try {
        const stored =
          this.document.defaultView?.localStorage.getItem(LANGUAGE_COOKIE);
        if (isAppLanguage(stored)) return stored;
      } catch {
        /* Storage may be unavailable in a WebView/private window. */
      }
    }
    return 'fa';
  }
  private nextId = 0;
  controlId(): string {
    return `aio-language-${this.nextId++}`;
  }
  setLanguage(language: AppLanguage): void {
    this.selected.set(language);
    if (this.browser) {
      this.document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
      try {
        this.document.defaultView?.localStorage.setItem(
          LANGUAGE_COOKIE,
          language,
        );
      } catch {
        /* The cookie still preserves the selection. */
      }
    }
  }
  text(
    value: string | number | null | undefined,
    values: readonly unknown[] = [],
  ): string {
    this.messages();
    return translateMessage(value, this.language(), values);
  }
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return value.toLocaleString(this.english() ? 'en-US' : 'fa-IR', options);
  }
  /**
   * A date for display: Solar Hijri with Persian digits in Persian, Gregorian
   * in English. Takes an ISO day (`2026-11-02`, a calendar day) or an ISO
   * instant (shown in Tehran time). Prefer the `aioDate` pipe in templates.
   */
  date(
    iso: string | null | undefined,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
  ): string {
    if (!iso) return '';
    const date = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    if (!Number.isFinite(+date)) return '';
    const english = this.english();
    const result = new Intl.DateTimeFormat(
      english ? 'en-US' : 'fa-IR-u-ca-persian',
      {
        timeZone: iso.length === 10 ? 'UTC' : 'Asia/Tehran',
        ...options,
        calendar: english ? 'gregory' : 'persian',
        numberingSystem: english ? 'latn' : 'arabext',
      },
    ).format(date);
    return english ? result : result.replace(/,/g, '،');
  }
}

/** Impure because a language change must update copy even when the message input stays identical. */
@Pipe({ name: 'aioTranslate', pure: false })
export class AioTranslate implements PipeTransform {
  private readonly locale = inject(AioLocale);
  transform(value: unknown, values?: readonly unknown[]): string {
    return this.locale.text(
      value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value === 'number'
        ? value
        : String(value),
      values,
    );
  }
}

/**
 * Startup gate for the message table: English (and server rendering) wait for
 * it, Persian renders at once and picks up English-source copy when it lands.
 */
export function provideAioLocale(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const locale = inject(AioLocale);
    if (locale.english() || !isPlatformBrowser(inject(PLATFORM_ID)))
      return locale.ready;
    return undefined;
  });
}

/**
 * `{{ iso | aioDate }}` / `{{ iso | aioDate: { weekday: 'long', day: 'numeric' } }}`:
 * every displayed date goes through this, so it follows the language (Solar
 * Hijri in Persian, Gregorian in English). Impure: it re-renders on a switch.
 */
@Pipe({ name: 'aioDate', pure: false })
export class AioDatePipe implements PipeTransform {
  private readonly locale = inject(AioLocale);
  transform(
    iso: string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    return this.locale.date(iso, options);
  }
}

/** Mark a `{0}` value for `aioTranslate` as user/learning content: never translated. */
export { verbatim } from '@all-in-one/localization';
