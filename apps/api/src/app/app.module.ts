import { PushModule } from '../push/push.module';
import { Module } from '@nestjs/common';
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
  controllers: [AppController, HealthController, AdminController],
  providers: [AppService, CatalogSeeder],
})
export class AppModule {}
