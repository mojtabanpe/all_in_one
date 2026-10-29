import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  LoginInput,
  RegisterInput,
  User,
} from '@all-in-one/shared/schemas';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';

/** Session state. The session itself is an httpOnly cookie set by the api. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private pending: Promise<User | null> | null = null;

  /** `undefined` until the first `load()`; `null` when logged out. */
  readonly user = signal<User | null | undefined>(undefined);
  readonly loggedIn = computed(() => !!this.user());

  /** Loads the current user once (deduplicated). */
  load(): Promise<User | null> {
    const known = this.user();
    if (known !== undefined) return Promise.resolve(known);
    this.pending ??= firstValueFrom(this.http.get<User>(`${this.api}/auth/me`))
      .then((user) => user)
      .catch(() => null)
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
    return user;
  }

  async register(input: RegisterInput): Promise<User> {
    const user = await firstValueFrom(
      this.http.post<User>(`${this.api}/auth/register`, input),
    );
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.api}/auth/logout`, {}),
    ).catch(() => undefined);
    this.user.set(null);
  }

  /** Called when the api answers 401: the session expired. */
  expire(): void {
    this.user.set(null);
  }
}
