import { AioTitleStrategy, provideAioLocale } from '@all-in-one/ui';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
} from '@angular/router';
import {
  authInterceptor,
  provideErrorMonitor,
  restartRetryInterceptor,
} from '@all-in-one/web/shared';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAioLocale(),
    // Route titles follow the app language (they are written in Persian).
    { provide: TitleStrategy, useExisting: AioTitleStrategy },
    provideBrowserGlobalErrorListeners(),
    provideErrorMonitor('admin'),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([restartRetryInterceptor, authInterceptor]),
    ),
  ],
};
