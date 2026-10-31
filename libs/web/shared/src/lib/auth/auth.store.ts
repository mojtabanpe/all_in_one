import { PushSettings } from './push-settings';
import { NativePush } from './native-push';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  RegisterResult,
  User,
} from '@all-in-one/shared/schemas';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';

const LAST_USER = 'aio:last-user';

/** The last signed-in profile (no secrets), so the offline PWA keeps its user. */
function remember(user: User | null): void {
  try {
    if (user) localStorage.setItem(LAST_USER, JSON.stringify(user));
    else localStorage.removeItem(LAST_USER);
  } catch {
    // Storage blocked or unavailable (SSR, private mode): offline fallback is off.
  }
}

function lastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

/** No answer from the api at all (offline, or the service worker's 504). */
const unreachable = (error: unknown) =>
  error instanceof HttpErrorResponse &&
  (error.status === 0 || error.status === 504);

/** Session state. The session itself is an httpOnly cookie set by the api. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly nativePush = inject(NativePush);
  private readonly push = inject(PushSettings);
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private pending: Promise<User | null> | null = null;

  /** `undefined` until the first `load()`; `null` when logged out. */
  readonly user = signal<User | null | undefined>(undefined);
  readonly loggedIn = computed(() => !!this.user());

  constructor() {
    effect(() => this.nativePush.setUser(this.user()?.id ?? null));
  }

  /** Loads the current user once (deduplicated). */
  load(): Promise<User | null> {
    const known = this.user();
    if (known !== undefined) return Promise.resolve(known);
    this.pending ??= firstValueFrom(this.http.get<User>(`${this.api}/auth/me`))
      .then((user) => {
        remember(user);
        return user;
      })
      .catch((error: unknown) => {
        // Offline: keep the last user; the cookie is checked again once online.
        if (unreachable(error)) return lastUser();
        remember(null);
        return null;
      })
      .then((user) => {
        this.user.set(user);
        this.pending = null;
        return user;
      });
    return this.pending;
  }

  async login(input: LoginInput): Promise<User> {
    const user = await firstValueFrom(
      this.http.post<User>(`${this.api}/auth/login`, input),
    );
    this.user.set(user);
    remember(user);
    return user;
  }

  /** Signs in right away, or reports that a confirmation email was sent. */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const result = await firstValueFrom(
      this.http.post<RegisterResult>(`${this.api}/auth/register`, input),
    );
    if (result.status === 'signed-in') {
      this.user.set(result.user);
      remember(result.user);
    }
    return result;
  }

  resendVerification(email: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/auth/resend-verification`, { email }),
    );
  }

  verifyEmail(token: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/auth/verify-email`, { token }),
    );
  }

  forgotPassword(email: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/auth/forgot-password`, { email }),
    );
  }

  resetPassword(token: string, password: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/auth/reset-password`, {
        token,
        password,
      }),
    );
  }

  /** Other devices are signed out; this session continues. */
  changePassword(input: ChangePasswordInput): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/auth/password`, input),
    );
  }

  async logout(): Promise<void> {
    await this.push.disconnect();
    await firstValueFrom(
      this.http.post<void>(`${this.api}/auth/logout`, {}),
    ).catch(() => undefined);
    this.user.set(null);
    remember(null);
  }

  /** Called when the api answers 401: the session expired. */
  expire(): void {
    this.user.set(null);
    remember(null);
  }
}
