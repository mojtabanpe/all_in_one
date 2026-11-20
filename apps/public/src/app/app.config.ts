import { provideAioLocale } from '@all-in-one/ui';
import { provideErrorMonitor } from '@all-in-one/web/shared';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { appRoutes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideAioLocale(),
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideErrorMonitor('public'),
    provideRouter(
      appRoutes,
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
    ),
  ],
};
