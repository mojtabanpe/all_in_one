import { AioTitleStrategy, provideAioLocale } from '@all-in-one/ui';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  TitleStrategy,
  withInMemoryScrolling,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  authInterceptor,
  localScheduleInterceptor,
  restartRetryInterceptor,
} from '@all-in-one/web/shared';
import { aiPaywallInterceptor } from './billing/ai-paywall';
import { appRoutes } from './app.routes';
import { onboardingFeedbackInterceptor } from './onboarding-feedback';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAioLocale(),
    // Route titles follow the app language (they are written in Persian).
    { provide: TitleStrategy, useExisting: AioTitleStrategy },
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        restartRetryInterceptor,
        authInterceptor,
        aiPaywallInterceptor,
        onboardingFeedbackInterceptor,
        localScheduleInterceptor,
      ]),
    ),
    // PWA (install on phone, offline shell, updates); production builds only.
    // push-sw.js wraps ngsw-worker.js and makes notification taps reliable on iPhone.
    provideServiceWorker('push-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
