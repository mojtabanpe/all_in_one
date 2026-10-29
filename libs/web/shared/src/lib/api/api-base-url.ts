import { InjectionToken } from '@angular/core';

/** Base URL of the backend. Apps proxy `/api` to it in development. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
