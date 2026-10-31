import * as z from 'zod/mini';

export const pushEndpointSchema = z.string().check(
  z.maxLength(2048),
  z.refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        [
          'fcm.googleapis.com',
          'updates.push.services.mozilla.com',
          'web.push.apple.com',
        ].includes(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'نشانی سرویس اعلان معتبر نیست.'),
);
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().check(z.regex(/^[A-Za-z0-9_-]{87}=?$/)),
    auth: z.string().check(z.regex(/^[A-Za-z0-9_-]{22}={0,2}$/)),
  }),
});
export const nativePushSchema = z.object({
  platform: z.enum(['ANDROID', 'MACOS']),
  token: z
    .string()
    .check(z.minLength(20), z.maxLength(4096), z.regex(/^[A-Za-z0-9_:.-]+$/)),
});
export type NativePushInput = z.infer<typeof nativePushSchema>;
export const removePushSchema = z.object({
  endpoint: z.union([
    pushEndpointSchema,
    z.string().check(z.regex(/^native:[a-f0-9]{64}$/)),
  ]),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Daily language reminder; times are Tehran wall-clock times. */
export const reviewReminderSchema = z.object({
  enabled: z.boolean(),
  time: z.string().check(z.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
});
export type ReviewReminderSettings = z.infer<typeof reviewReminderSchema>;
