import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Role } from '@all-in-one/shared/schemas';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

/** Requires a session (and optionally a role); otherwise redirects to /login. */
export function authGuard(role?: Role): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    const user = await auth.load();
    if (!user)
      return router.createUrlTree(['/login'], {
        queryParams: { redirect: state.url },
      });
    if (role && user.role !== role) {
      await auth.logout();
      return router.createUrlTree(['/login'], { queryParams: { denied: 1 } });
    }
    return true;
  };
}

/** For /login: logged-in users go home. */
export const guestGuard: CanActivateFn = async () => {
  const user = await inject(AuthStore).load();
  return user ? inject(Router).createUrlTree(['/']) : true;
};

/** A 401 from the api (other than the session probe) ends the session and goes to /login. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: unknown) => {
      const isAuthCall = req.url.includes('/auth/');
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthCall
      ) {
        auth.expire();
        void router.navigate(['/login'], {
          queryParams: { redirect: router.url },
        });
      }
      return throwError(() => error);
    }),
  );
};

/** Persian message for a failed api call. */
export function apiErrorMessage(
  error: unknown,
  fallback = 'خطایی رخ داد. دوباره تلاش کنید.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'ارتباط با سرور برقرار نشد.';
    if (error.status === 429)
      return 'تعداد تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.';
    const message = error.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string')
      return message[0].replace(/^[\w.]+: /, '');
  }
  return fallback;
}
