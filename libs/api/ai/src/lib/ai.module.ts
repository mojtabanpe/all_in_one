import { Global, Module } from '@nestjs/common';
import { AiAdminController, AiController } from './ai.controller';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';
import { AiScopeGuard } from './ai-scope';
import { LocalScopeClassifier } from './scope-classifier';

/** Managed AI services. Global so every applet's api can inject `AiGateway`. */
@Global()
@Module({
  controllers: [AiController, AiAdminController],
  providers: [AiSettingsService, AiGateway, AiScopeGuard, LocalScopeClassifier],
  exports: [AiSettingsService, AiGateway, AiScopeGuard],
})
export class AiModule {}
