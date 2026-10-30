import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type AiKind,
  testAiSchema,
  type UpdateAiSettingsInput,
  updateAiSettingsSchema,
} from '@all-in-one/shared/schemas';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';

/** The signed-in user's AI services (profile page). Keys are write-only. */
@Controller('ai')
export class AiController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly gateway: AiGateway,
  ) {}

  @Get('settings')
  view(@CurrentUser() user: AuthUser) {
    return this.settings.view(user.id);
  }

  @Put('settings')
  update(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateAiSettingsSchema }) input: UpdateAiSettingsInput,
  ) {
    return this.settings.update(user.id, input);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.settings.status(user.id);
  }

  @Post('settings/test')
  @HttpCode(200)
  test(
    @CurrentUser() user: AuthUser,
    @Body({ schema: testAiSchema }) input: { kind: AiKind },
  ) {
    return this.gateway.test(user.id, input.kind);
  }
}
