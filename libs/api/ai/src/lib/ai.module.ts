import { Global, Module } from '@nestjs/common';
import { AiAdminController, AiController } from './ai.controller';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';
import { AiScopeGuard } from './ai-scope';
import { LocalScopeClassifier } from './scope-classifier';
import { AiUsageService } from './ai-usage.service';

/** Managed AI services. Global so every applet's api can inject `AiGateway`. */
@Global()
@Module({
  controllers: [AiController, AiAdminController],
  providers: [
    AiSettingsService,
    AiGateway,
    AiScopeGuard,
    LocalScopeClassifier,
    AiUsageService,
  ],
  exports: [AiSettingsService, AiGateway, AiScopeGuard, AiUsageService],
})
export class AiModule {}
