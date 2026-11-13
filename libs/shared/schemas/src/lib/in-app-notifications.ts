import * as z from 'zod/mini';

const copy = z.strictObject({
  fa: z.string().check(z.minLength(1), z.maxLength(2000)),
  en: z.string().check(z.minLength(1), z.maxLength(2000)),
});
const destination = z.string().check(
  z.maxLength(2048),
  z.refine(
    (value) =>
      /^\/(?!\/)[^\\]*$/.test(value) || /^https:\/\/[^\s\\]+$/.test(value),
    'Use an app route or HTTPS URL',
  ),
);
export const inAppContentSchema = z.strictObject({
  title: copy,
  message: copy,
  detail: z.optional(copy),
  actions: z
    .array(
      z.strictObject({
        label: copy,
        url: destination,
        primary: z.optional(z.boolean()),
      }),
    )
    .check(z.maxLength(3)),
});
export type InAppContent = z.infer<typeof inAppContentSchema>;
export interface InAppNotification extends InAppContent {
  id: string;
}
export const createInAppNotificationSchema = z.strictObject({
  userId: z.uuid(),
  key: z.string().check(z.minLength(1), z.maxLength(150)),
  content: inAppContentSchema,
  expiresAt: z.iso.datetime(),
});
export type CreateInAppNotification = z.infer<
  typeof createInAppNotificationSchema
>;
