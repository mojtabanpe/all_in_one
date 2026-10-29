import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@all-in-one/api/db';
import { type AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';

export const SESSION_COOKIE = 'aio_session';

interface SessionPayload {
  sub: string;
  role: Role;
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * Global guard: every route requires a valid session cookie unless marked
 * `@Public()`; `@Roles(...)` additionally restricts by role.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const request = context.switchToHttp().getRequest();
    const token = readCookie(request.headers?.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException();

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    const user: AuthUser = { id: payload.sub, role: payload.role };
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES,
      targets,
    );
    if (roles?.length && !roles.includes(user.role))
      throw new ForbiddenException();
    return true;
  }
}
