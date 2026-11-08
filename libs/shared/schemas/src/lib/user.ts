// zod/mini keeps browser bundles small: schemas here ship to every Angular app.
import * as z from 'zod/mini';
import { growthAttributionSchema, growthCampaignSchema } from './growth';

// Mirrors the Role enum in apps/api/prisma/schema.prisma.
export const roleSchema = z.enum(['ADMIN', 'CUSTOMER']);
export type Role = z.infer<typeof roleSchema>;

/** A user as the api returns it: never includes the password hash. */
export const userSchema = z.object({
  id: z.uuid(),
  /** Null for an account made with a phone number alone (directive 119). */
  email: z.nullable(z.email()),
  /** Confirmed Iranian mobile in E.164, or null. */
  phone: z.nullable(z.string()),
  /** False for a phone-only account that never set a password. */
  hasPassword: z.boolean(),
  name: z.nullable(z.string()),
  role: roleSchema,
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().check(z.minLength(8)),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  acquisition: z.optional(growthAttributionSchema),
  email: z.email(),
  password: z.string().check(z.minLength(8), z.maxLength(128)),
  name: z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(80))),
});
export type RegisterInput = z.infer<typeof registerSchema>;

const password = z.string().check(z.minLength(8), z.maxLength(128));

/** Signed-in password change; other sessions are signed out. */
export const changePasswordSchema = z.object({
  /** Required when the account already has a password. */
  currentPassword: z.optional(z.string().check(z.maxLength(128))),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** "Forgot password" and "resend confirmation": always answered the same way. */
export const emailOnlySchema = z.object({ email: z.email() });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
export const resendVerificationSchema = z.object({
  email: z.email(),
  campaign: z.optional(growthCampaignSchema),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/** Single-use tokens from emailed links (43-char base64url). */
const linkToken = z.string().check(z.regex(/^[A-Za-z0-9_-]{43}$/));

export const resetPasswordSchema = z.object({ token: linkToken, password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: linkToken });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Sign-up either starts a session or waits for the emailed confirmation link. */
export type RegisterResult =
  | { status: 'signed-in'; user: User }
  | { status: 'verify-email'; email: string };

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * An Iranian mobile number in E.164 (`+989121234567`), from what people type: `09121234567`, `9121234567`,
 * `+98 912 123 4567`, `00989121234567`, Persian or Arabic digits. Null when it is not an Iranian mobile.
 */
export function iranMobile(input: string): string | null {
  const latin = input.replace(/[۰-۹٠-٩]/g, (d) =>
    String(
      PERSIAN_DIGITS.includes(d)
        ? PERSIAN_DIGITS.indexOf(d)
        : ARABIC_DIGITS.indexOf(d),
    ),
  );
  const digits = latin.replace(/[\s\-().]/g, '');
  const match = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(digits);
  return match ? `+98${match[1]}` : null;
}

const mobile = z.string().check(
  z.maxLength(24),
  z.refine((value) => iranMobile(value) !== null, 'شمارهٔ موبایل درست نیست.'),
);
const smsCode = z.string().check(z.regex(/^\d{6}$/));

/** Start confirming a mobile number for the signed-in account (a 6-digit code by SMS). */
export const phoneStartSchema = z.object({ phone: mobile });
export type PhoneStartInput = z.infer<typeof phoneStartSchema>;
export const phoneConfirmSchema = z.object({ code: smsCode });
export type PhoneConfirmInput = z.infer<typeof phoneConfirmSchema>;

/** «Forgot password» by SMS: always answered the same way, whether the number belongs to an account or not. */
export const phoneResetRequestSchema = z.object({ phone: mobile });
export type PhoneResetRequestInput = z.infer<typeof phoneResetRequestSchema>;
export const phoneResetSchema = z.object({
  phone: mobile,
  code: smsCode,
  password,
});
export type PhoneResetInput = z.infer<typeof phoneResetSchema>;

/** Sign in or sign up with an SMS code (directive 119): one request, one 6-digit code, the same answer for any number. */
export const smsLoginRequestSchema = z.object({ phone: mobile });
export type SmsLoginRequestInput = z.infer<typeof smsLoginRequestSchema>;
export const smsLoginSchema = z.object({
  acquisition: z.optional(growthAttributionSchema),
  phone: mobile,
  code: smsCode,
});
export type SmsLoginInput = z.infer<typeof smsLoginSchema>;
/** `created`: the code made a new account (a phone alone is enough). */
export interface SmsLoginResult {
  user: User;
  created: boolean;
}

/** The account's number; `enabled` is false while SMS sending is switched off on the server. */
export interface PhoneState {
  enabled: boolean;
  phone: string | null;
  /** A code was sent to this number and waits for confirmation. */
  pending: string | null;
  /** Set by a confirmation that earned the second-contact week (directive 121). */
  rewardedWeek?: boolean;
}
