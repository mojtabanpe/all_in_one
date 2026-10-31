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
export const removePushSchema = z.object({ endpoint: pushEndpointSchema });
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
