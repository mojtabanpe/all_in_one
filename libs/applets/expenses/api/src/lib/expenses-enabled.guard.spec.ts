import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ExpensesEnabledGuard } from './expenses-enabled.guard';

function context(user?: { id: string; role: 'ADMIN' | 'CUSTOMER' }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('ExpensesEnabledGuard (directive 160)', () => {
  function guard(enabledApplets: string[] | null) {
    const findUnique = vi.fn(async () =>
      enabledApplets ? { enabledApplets, role: 'CUSTOMER' } : null,
    );
    return {
      guard: new ExpensesEnabledGuard({ user: { findUnique } } as never),
      findUnique,
    };
  }

  it('lets a customer in after they turned expenses on', async () => {
    const { guard: g } = guard(['planner', 'expenses']);
    await expect(
      g.canActivate(context({ id: 'u1', role: 'CUSTOMER' })),
    ).resolves.toBe(true);
  });

  it('keeps expenses closed for a customer who has not turned it on', async () => {
    const { guard: g } = guard(['planner', 'english', 'health']);
    await expect(
      g.canActivate(context({ id: 'u1', role: 'CUSTOMER' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('always lets admins in without a lookup', async () => {
    const { guard: g, findUnique } = guard(null);
    await expect(
      g.canActivate(context({ id: 'a1', role: 'ADMIN' })),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses a request without a session', async () => {
    const { guard: g } = guard(null);
    await expect(g.canActivate(context())).resolves.toBe(false);
  });
});
