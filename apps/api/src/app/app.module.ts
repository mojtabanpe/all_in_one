import { OnboardingController } from './onboarding.controller';
import { PushModule } from '../push/push.module';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@all-in-one/api/ai';
import { AuthModule } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { HealthApiModule } from '@all-in-one/applets/health/api';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { envSchema } from '../config/env';
import { AdminController } from '../admin/admin.controller';
import { HealthController } from '../health/health.controller';
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
import {
  BillingController,
  PaymentsController,
} from '../billing/billing.controller';
import { BillingService } from '../billing/billing.service';
import { BillingReconciler } from '../billing/billing-reconciler';
import { ZibalGateway } from '../billing/zibal.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    PushModule,
    AuthModule,
    // Per-user AI services (profile settings) for every applet
    AiModule,
    // Applets
    PlannerApiModule,
    EnglishApiModule,
    HealthApiModule,
    // ChatGPT connection and the in-app assistant (same tools)
    McpModule,
    AssistantModule,
  ],
  controllers: [
    AppController,
    HealthController,
    AdminController,
    GrowthController,
    OnboardingController,
    BillingController,
    PaymentsController,
  ],
  providers: [
    AppService,
    CatalogSeeder,
    GrowthService,
    GrowthRetention,
    { provide: APP_INTERCEPTOR, useClass: GrowthActivityInterceptor },
    OnboardingService,
    ZibalGateway,
    BillingService,
    BillingReconciler,
  ],
})
export class AppModule {}
