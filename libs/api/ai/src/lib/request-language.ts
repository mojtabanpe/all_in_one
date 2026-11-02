import { AsyncLocalStorage } from 'node:async_hooks';
import type { AppLanguage } from '@all-in-one/localization';

/** Request-local context; concurrent users never share a mutable global locale. */
export const requestLanguage = new AsyncLocalStorage<AppLanguage>();
