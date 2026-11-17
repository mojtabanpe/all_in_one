import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import { resolveEnabledApplets } from '@all-in-one/shared/schemas';

/**
 * Expenses is an experiment every account may turn on (directive 160). Customers reach its api only after turning it
 * on in their account; admins always can (they manage its default categories).
 */
@Injectable()
export class ExpensesEnabledGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { enabledApplets: true, role: true },
    });
    if (
      account &&
      resolveEnabledApplets(account.enabledApplets, account.role).includes(
        'expenses',
      )
    )
      return true;
    throw new ForbiddenException(
      'بخش مخارج خاموش است؛ از حساب کاربری روشنش کن.',
    );
  }
}
