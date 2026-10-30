import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@all-in-one/api/db';
import { IS_PUBLIC, ROLES } from './auth.decorators';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';

const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });

function context(
  cookie: string | undefined,
  meta: Record<string, unknown> = {},
) {
  const request: Record<string, unknown> = {
    headers: cookie ? { cookie } : {},
  };
  const handler = () => undefined;
  for (const [key, value] of Object.entries(meta))
    Reflect.defineMetadata(key, value, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

/** Users the guard can look up: u1 is a customer whose password was changed once. */
const users: Record<string, { role: string; sessionVersion: number }> = {
  u1: { role: 'CUSTOMER', sessionVersion: 1 },
};
const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users[where.id] ?? null,
  },
} as unknown as PrismaService;

describe('AuthGuard', () => {
  const guard = new AuthGuard(jwt, new Reflector(), prisma);

  it('lets public routes through without a session', async () => {
    await expect(
      guard.canActivate(context(undefined, { [IS_PUBLIC]: true }).ctx),
    ).resolves.toBe(true);
  });

  it('rejects requests without a session cookie', async () => {
    await expect(
      guard.canActivate(context(undefined).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a forged token', async () => {
    await expect(
      guard.canActivate(context(`${SESSION_COOKIE}=a.b.c`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets request.user from a valid session', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'CUSTOMER', sv: 1 });
    const { ctx, request } = context(`theme=dark; ${SESSION_COOKIE}=${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request['user']).toEqual({ id: 'u1', role: 'CUSTOMER' });
  });

  it('enforces @Roles', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'CUSTOMER', sv: 1 });
    await expect(
      guard.canActivate(
        context(`${SESSION_COOKIE}=${token}`, { [ROLES]: ['ADMIN'] }).ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a session from before the last password change', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'CUSTOMER', sv: 0 });
    await expect(
      guard.canActivate(context(`${SESSION_COOKIE}=${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session of a deleted user', async () => {
    const token = await jwt.signAsync({ sub: 'gone', role: 'CUSTOMER', sv: 0 });
    await expect(
      guard.canActivate(context(`${SESSION_COOKIE}=${token}`).ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
