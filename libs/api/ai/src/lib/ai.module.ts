import { Global, Module } from '@nestjs/common';
import { AiAdminController, AiController } from './ai.controller';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';
import { AiScopeGuard } from './ai-scope';

/** Managed AI services. Global so every applet's api can inject `AiGateway`. */
@Global()
@Module({
  controllers: [AiController, AiAdminController],
  providers: [AiSettingsService, AiGateway, AiScopeGuard],
  exports: [AiSettingsService, AiGateway, AiScopeGuard],
})
export class AiModule {}
