import { HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ONBOARDING_COMPLETED_HEADER } from '@all-in-one/shared/schemas';
import { AioNotifications } from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { tap } from 'rxjs';

export const onboardingFeedbackInterceptor: HttpInterceptorFn = (
  request,
  next,
) => {
  const api = inject(API_BASE_URL);
  if (request.method !== 'POST' || !request.url.startsWith(api + '/'))
    return next(request);

  const notifications = inject(AioNotifications);
  return next(request).pipe(
    tap((event) => {
      if (
        event instanceof HttpResponse &&
        event.ok &&
        event.headers.get(ONBOARDING_COMPLETED_HEADER) === '1'
      )
        notifications.success(
          'قدم اولت انجام شد. با یک قدم کوچک دیگر در روز بعد ادامه بده.',
        );
    }),
  );
};
