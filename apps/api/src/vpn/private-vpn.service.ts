import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaService } from '@all-in-one/api/db';
import { paidVpnEntitlement, vpnBillingSelect } from './vpn-entitlement';

interface VpnAccess {
  link: string | null;
  expiresAt: number;
  quotaBytes: number;
  remainingBytes: number;
}

const RETRY_MS = 60_000;

@Injectable()
export class PrivateVpnService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  private readonly logger = new Logger(PrivateVpnService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled() {
    return !!(
      this.config.get('VPN_SERVICE_URL') && this.config.get('VPN_SERVICE_TOKEN')
    );
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.sweep(), RETRY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async eligible(userId: string) {
    return this.enabled && !!(await this.entitlement(this.db, userId));
  }

  async forChat(userId: string, chatId: bigint) {
    if (!this.enabled) return null;

    // Persist the reconciliation schedule even if a remote create times out after applying.
    const queued = await this.db.user.updateMany({
      where: {
        id: userId,
        vpnFriendCycle: { not: null },
        telegramLink: { chatId },
      },
      data: { vpnSyncAt: new Date() },
    });
    if (!queued.count) return null;
    return this.sync(userId, chatId);
  }

  private async entitlement(
    db: Prisma.TransactionClient,
    userId: string,
    chatId?: bigint,
  ) {
    const now = new Date();
    const user = await db.user.findFirst({
      where: {
        id: userId,
        role: 'CUSTOMER',
        vpnFriendCycle: { not: null },
        telegramLink: chatId === undefined ? { isNot: null } : { chatId },
        billingSubscription: { paidUntil: { gt: now } },
      },
      select: { vpnFriendCycle: true, ...vpnBillingSelect },
    });
    if (!user) return null;
    const entitlement = paidVpnEntitlement(user, now);
    return entitlement?.cycle === user.vpnFriendCycle ? entitlement : null;
  }

  private sync(userId: string, chatId?: bigint) {
    return this.db.$transaction(
      async (tx) => {
        // Billing and VPN writes for a customer share this lock. The service receives absolute values.
        await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            vpnSyncAt: true,
            telegramLink: { select: { chatId: true } },
          },
        });
        if (
          !user?.vpnSyncAt ||
          (chatId === undefined && user.vpnSyncAt > new Date())
        )
          return null;
        if (chatId !== undefined && user.telegramLink?.chatId !== chatId)
          return null;
        const entitlement = await this.entitlement(tx, userId, chatId);
        const url = this.config
          .getOrThrow<string>('VPN_SERVICE_URL')
          .replace(/\/$/, '');
        const token = this.config.getOrThrow<string>('VPN_SERVICE_TOKEN');
        const response = await fetch(`${url}/v1/accounts/${userId}`, {
          method: 'PUT',
          redirect: 'error',
          signal: AbortSignal.timeout(22_000),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ entitlement }),
        });
        if (!response.ok) throw new Error('VPN service unavailable');
        const { access }: { access: VpnAccess | null } = await response.json();
        await tx.user.update({
          where: { id: userId },
          data: {
            vpnSyncAt: entitlement ? new Date(Date.now() + RETRY_MS) : null,
          },
        });
        return access;
      },
      { timeout: 26_000 },
    );
  }

  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const due = await this.db.user.findMany({
        where: { vpnSyncAt: { lte: new Date() } },
        orderBy: [{ vpnSyncAt: 'asc' }, { id: 'asc' }],
        take: 25,
        select: { id: true, vpnSyncAt: true },
      });
      for (const user of due) {
        try {
          await this.sync(user.id);
        } catch {
          this.logger.warn('VPN account reconciliation failed; will retry');
          await this.db.user.updateMany({
            where: { id: user.id, vpnSyncAt: user.vpnSyncAt },
            data: { vpnSyncAt: new Date(Date.now() + RETRY_MS) },
          });
        }
      }
    } catch {
      this.logger.warn('VPN reconciliation failed; will retry');
    } finally {
      this.sweeping = false;
    }
  }
}
