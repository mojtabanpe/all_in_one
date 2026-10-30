// zod/mini keeps browser bundles small: schemas here ship to every Angular app.
import * as z from 'zod/mini';

// Mirrors the Role enum in apps/api/prisma/schema.prisma.
export const roleSchema = z.enum(['ADMIN', 'CUSTOMER']);
export type Role = z.infer<typeof roleSchema>;

/** A user as the api returns it: never includes the password hash. */
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
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
  email: z.email(),
  password: z.string().check(z.minLength(8), z.maxLength(128)),
  name: z.optional(z.string().check(z.trim(), z.minLength(1), z.maxLength(80))),
});
export type RegisterInput = z.infer<typeof registerSchema>;

const password = z.string().check(z.minLength(8), z.maxLength(128));

/** Signed-in password change; other sessions are signed out. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().check(z.minLength(1)),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** "Forgot password" and "resend confirmation": always answered the same way. */
export const emailOnlySchema = z.object({ email: z.email() });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

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
