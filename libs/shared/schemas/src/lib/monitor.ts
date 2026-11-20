import * as z from 'zod/mini';
import { GROWTH_CLIENTS } from './growth';

/**
 * One error from a browser or the native app. No task, health or account content: only what is
 * needed to find the bug (message, stack, route path, version, client, connectivity).
 */
export const clientErrorSchema = z.strictObject({
  /** `native`: the Flutter WebView shell itself (Android/macOS), not the web app inside it. */
  app: z.enum(['customer', 'admin', 'public', 'native']),
  kind: z.enum(['error', 'chunk', 'promise']),
  message: z.string().check(z.maxLength(500)),
  stack: z.optional(z.string().check(z.maxLength(6000))),
  /** Path only, never the query or fragment (they can carry tokens). */
  path: z.string().check(z.maxLength(200)),
  version: z.string().check(z.maxLength(40)),
  client: z.enum(GROWTH_CLIENTS),
  online: z.boolean(),
  /** Seconds the page had been open when the error happened. */
  age: z.optional(z.number().check(z.int(), z.nonnegative())),
});
export type ClientError = z.infer<typeof clientErrorSchema>;

export const clientErrorBatchSchema = z.strictObject({
  errors: z.array(clientErrorSchema).check(z.minLength(1), z.maxLength(20)),
});
export type ClientErrorBatch = z.infer<typeof clientErrorBatchSchema>;
