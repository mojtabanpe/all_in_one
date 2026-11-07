import { Global, Module } from '@nestjs/common';
import { AI_ACCESS } from '@all-in-one/api/ai';
import { AuthModule } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { BillingController, PaymentsController } from './billing.controller';
import { BillingReconciler } from './billing-reconciler';
import { BillingService } from './billing.service';
import { ZibalGateway } from './zibal.gateway';

@Global()
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BillingController, PaymentsController],
  providers: [
    BillingService,
    BillingReconciler,
    ZibalGateway,
    { provide: AI_ACCESS, useExisting: BillingService },
  ],
  exports: [AI_ACCESS],
})
export class BillingModule {}
