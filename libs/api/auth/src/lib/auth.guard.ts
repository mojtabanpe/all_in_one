import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, type Role } from '@all-in-one/api/db';
import { type AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';

export const SESSION_COOKIE = 'aio_session';

interface SessionPayload {
  sub: string;
  role: Role;
  /** User.sessionVersion when the session started; older sessions are rejected. */
  sv?: number;
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
    private readonly prisma: PrismaService,
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
    // The user must still exist and the session must postdate the last password change.
    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, sessionVersion: true },
    });
    if (!account || account.sessionVersion !== (payload.sv ?? 0))
      throw new UnauthorizedException();
    const user: AuthUser = { id: payload.sub, role: account.role };
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
