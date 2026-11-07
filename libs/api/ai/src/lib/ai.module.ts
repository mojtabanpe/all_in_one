import { Global, Module } from '@nestjs/common';
import { AiAdminController, AiController } from './ai.controller';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';

/** Managed AI services. Global so every applet's api can inject `AiGateway`. */
@Global()
@Module({
  controllers: [AiController, AiAdminController],
  providers: [AiSettingsService, AiGateway],
  exports: [AiSettingsService, AiGateway],
})
export class AiModule {}
