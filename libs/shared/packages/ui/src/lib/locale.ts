import { Directionality } from '@angular/cdk/bidi';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Pipe,
  PLATFORM_ID,
  REQUEST,
  signal,
  untracked,
  type PipeTransform,
} from '@angular/core';
import {
  LANGUAGE_COOKIE,
  isAppLanguage,
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
    return translateMessage(value, this.language(), values);
  }
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return value.toLocaleString(this.english() ? 'en-US' : 'fa-IR', options);
  }
  date(
    iso: string,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
  ): string {
    if (!iso) return '';
    const date = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    const result = new Intl.DateTimeFormat(
      this.english() ? 'en-US-u-ca-persian' : 'fa-IR-u-ca-persian',
      {
        timeZone: iso.length === 10 ? 'UTC' : 'Asia/Tehran',
        ...options,
        calendar: 'persian',
        numberingSystem: this.english() ? 'latn' : 'arabext',
      },
    ).format(date);
    return this.english()
      ? result.replace(/\s+AP\b/g, '').trim()
      : result.replace(/,/g, '،');
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
