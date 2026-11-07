import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser, Roles } from '@all-in-one/api/auth';
import {
  type AiKind,
  type SaveAiPresetInput,
  saveAiPresetSchema,
  testAiSchema,
  testAiScopeSchema,
  type TestAiScopeInput,
  type UpdateAiSettingsInput,
  updateAiSettingsSchema,
} from '@all-in-one/shared/schemas';
import { AiSettingsService } from './ai-settings.service';
import { AiScopeGuard } from './ai-scope';
import { AiUsageService } from './ai-usage.service';
import { AiHealthService } from './ai-health.service';
import { AI_ACCESS, AiGateway, type AiAccess } from './ai-gateway.service';

/** The signed-in user's AI services (profile page). Keys are write-only. */
@Roles('ADMIN')
@Controller('ai/admin/settings')
export class AiAdminController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly gateway: AiGateway,
    private readonly scope: AiScopeGuard,
    private readonly usage: AiUsageService,
    private readonly health: AiHealthService,
  ) {}

  /** Errors, fallback use and the daily budget, with alerts (since the api started). */
  @Get('health')
  async healthReport() {
    const [costs, dailyBudgetUsd] = await Promise.all([
      this.usage.costs(1),
      this.settings.dailyBudgetUsd(),
    ]);
    return this.health.report({ todayUsd: costs.totalUsd, dailyBudgetUsd });
  }

  /** Today's AI use of all accounts, per service. */
  @Get('usage')
  usageOverview() {
    return this.usage.overview();
  }

  /** What AI cost over the last 30 days at the admin's prices, per service and per access tier. */
  @Get('costs')
  costs() {
    return this.usage.costs();
  }

  /** Try a sentence against the current scope check (decision model). */
  @Post('scope-test')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  scopeTest(
    @CurrentUser() user: AuthUser,
    @Body({ schema: testAiScopeSchema }) input: TestAiScopeInput,
  ) {
    return this.scope.decide(user.id, input.text, 'assistant');
  }

  @Get()
  view() {
    return this.settings.view();
  }

  @Put()
  update(
    @Body({ schema: updateAiSettingsSchema }) input: UpdateAiSettingsInput,
  ) {
    return this.settings.update(input);
  }

  @Post('presets')
  @HttpCode(200)
  savePreset(@Body({ schema: saveAiPresetSchema }) input: SaveAiPresetInput) {
    return this.settings.savePreset(input);
  }

  @Post('presets/:id/apply')
  @HttpCode(200)
  applyPreset(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.applyPreset(id);
  }

  @Delete('presets/:id')
  removePreset(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.removePreset(id);
  }

  @Post('test')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  test(@Body({ schema: testAiSchema }) input: { kind: AiKind }) {
    return this.gateway.testManaged(input.kind);
  }
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly usage: AiUsageService,
    @Inject(AI_ACCESS) private readonly access: AiAccess,
  ) {}

  @Get('status')
  status() {
    return this.settings.status();
  }

  /** The signed-in account's AI use today and its daily limits. */
  @Get('usage')
  async myUsage(@CurrentUser() user: AuthUser) {
    const { tier } = await this.access.access(user.id);
    return this.usage.view(user.id, tier);
  }
}
