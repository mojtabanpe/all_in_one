import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
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

describe('AuthGuard', () => {
  const guard = new AuthGuard(jwt, new Reflector());

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
    const token = await jwt.signAsync({ sub: 'u1', role: 'CUSTOMER' });
    const { ctx, request } = context(`theme=dark; ${SESSION_COOKIE}=${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request['user']).toEqual({ id: 'u1', role: 'CUSTOMER' });
  });

  it('enforces @Roles', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'CUSTOMER' });
    await expect(
      guard.canActivate(
        context(`${SESSION_COOKIE}=${token}`, { [ROLES]: ['ADMIN'] }).ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
