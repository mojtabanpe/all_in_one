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
