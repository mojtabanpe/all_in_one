import { Module } from '@nestjs/common';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { ExpensesApiModule } from '@all-in-one/applets/expenses/api';
import { HealthApiModule } from '@all-in-one/applets/health/api';
import { AssistantModule } from '../assistant/assistant.module';
import { BillingModule } from '../billing/billing.module';
import { TelegramController } from './telegram.controller';
import { TelegramSectionsService } from './telegram-sections';
import { TelegramService } from './telegram.service';

/** Telegram bot: account link, morning summary, logging by message (168) and the app's sections (174). */
@Module({
  imports: [
    AssistantModule,
    BillingModule,
    PlannerApiModule,
    EnglishApiModule,
    HealthApiModule,
    ExpensesApiModule,
  ],
  providers: [TelegramService, TelegramSectionsService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
