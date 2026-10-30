import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { HealthApiModule } from '@all-in-one/applets/health/api';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { envSchema } from '../config/env';
import { AdminController } from '../admin/admin.controller';
import { HealthController } from '../health/health.controller';
import { McpModule } from '../mcp/mcp.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    AuthModule,
    // Applets
    PlannerApiModule,
    EnglishApiModule,
    HealthApiModule,
    // ChatGPT connection
    McpModule,
  ],
  controllers: [AppController, HealthController, AdminController],
  providers: [AppService],
})
export class AppModule {}
