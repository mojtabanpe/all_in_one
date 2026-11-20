import { InAppPrompts } from '../in-app-prompts';
import {
  InAppNotificationsController,
  InAppNotificationsService,
} from '../in-app-notifications';
import { OnboardingController } from './onboarding.controller';
import { PushModule } from '../push/push.module';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@all-in-one/api/ai';
import { AuthModule } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { ExpensesApiModule } from '@all-in-one/applets/expenses/api';
import { HealthApiModule } from '@all-in-one/applets/health/api';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { envSchema } from '../config/env';
import { AdminController } from '../admin/admin.controller';
import { HealthController } from '../health/health.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { MonitorModule } from '../monitor/monitor.module';
import { AssistantModule } from '../assistant/assistant.module';
import { McpModule } from '../mcp/mcp.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatalogSeeder } from './catalog-seeder';
import { GrowthController } from '../growth/growth.controller';
import { GrowthService } from '../growth/growth.service';
import { GrowthRetention } from '../growth/growth-retention';
import { GrowthActivityInterceptor } from '../growth/growth-activity.interceptor';
import { OnboardingService } from './onboarding.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    PushModule,
    AuthModule,
    // Managed AI services for every applet
    BillingModule,
    AiModule,
    // Applets
    PlannerApiModule,
    EnglishApiModule,
    HealthApiModule,
    ExpensesApiModule,
    // ChatGPT connection and the in-app assistant (same tools)
    McpModule,
    AssistantModule,
    // Telegram bot (directive 168)
    TelegramModule,
    // Error monitoring (directive 184)
    MonitorModule,
  ],
  controllers: [
    InAppNotificationsController,
    AppController,
    HealthController,
    AdminController,
    GrowthController,
    OnboardingController,
  ],
  providers: [
    InAppNotificationsService,
    InAppPrompts,
    AppService,
    CatalogSeeder,
    GrowthService,
    GrowthRetention,
    { provide: APP_INTERCEPTOR, useClass: GrowthActivityInterceptor },
    OnboardingService,
  ],
})
export class AppModule {}
