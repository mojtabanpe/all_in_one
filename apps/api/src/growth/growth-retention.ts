import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';

export const GROWTH_RETENTION_DAYS = 90;

@Injectable()
export class GrowthRetention implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(GrowthRetention.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async prune(): Promise<void> {
    const where = {
      createdAt: {
        lt: new Date(Date.now() - GROWTH_RETENTION_DAYS * 86_400_000),
      },
    };
    await Promise.all([
      this.prisma.growthClientDay.deleteMany({ where }),
      this.prisma.growthEvent.deleteMany({ where }),
    ]);
  }

  onModuleInit(): void {
    if (this.config.get<string>('GROWTH_ANALYTICS_ENABLED') !== 'true') return;
    const sweep = () =>
      void this.prune().catch(() =>
        this.logger.warn(
          'Growth retention sweep failed; will retry in one hour',
        ),
      );
    sweep();
    this.timer = setInterval(sweep, 3_600_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
