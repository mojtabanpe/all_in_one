import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BillingService } from './billing.service';

/** Every ten minutes, verifies pending orders whose buyer never came back from the gateway. */
@Injectable()
export class BillingReconciler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(BillingReconciler.name);
  constructor(private readonly billing: BillingService) {}

  sweep(): void {
    void this.billing
      .reconcile()
      .catch(() =>
        this.logger.warn('Payment reconciliation failed; will retry'),
      );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.sweep(), 600_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
