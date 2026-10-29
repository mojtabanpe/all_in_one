import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Role } from '@all-in-one/api/db';

export const IS_PUBLIC = 'auth:isPublic';
export const ROLES = 'auth:roles';

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs one of these roles (on top of being logged in). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthUser {
  id: string;
  role: Role;
}

/** The logged-in user, set by `AuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
