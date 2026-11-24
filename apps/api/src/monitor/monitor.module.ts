import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AiHealthMonitorService } from './ai-health-monitor.service';
import { MonitorController } from './monitor.controller';
import { MonitorFilter } from './monitor.filter';
import { MonitorService } from './monitor.service';

@Global()
@Module({
  controllers: [MonitorController],
  providers: [
    MonitorService,
    AiHealthMonitorService,
    { provide: APP_FILTER, useClass: MonitorFilter },
  ],
  exports: [MonitorService, AiHealthMonitorService],
})
export class MonitorModule {}
