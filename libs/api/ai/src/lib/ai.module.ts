import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';

/** Per-user AI services. Global so every applet's api can inject `AiGateway`. */
@Global()
@Module({
  controllers: [AiController],
  providers: [AiSettingsService, AiGateway],
  exports: [AiSettingsService, AiGateway],
})
export class AiModule {}
