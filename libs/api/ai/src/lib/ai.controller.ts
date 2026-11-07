import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '@all-in-one/api/auth';
import {
  type AiKind,
  type SaveAiPresetInput,
  saveAiPresetSchema,
  testAiSchema,
  type UpdateAiSettingsInput,
  updateAiSettingsSchema,
} from '@all-in-one/shared/schemas';
import { AiGateway } from './ai-gateway.service';
import { AiSettingsService } from './ai-settings.service';

/** The signed-in user's AI services (profile page). Keys are write-only. */
@Roles('ADMIN')
@Controller('ai/admin/settings')
export class AiAdminController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly gateway: AiGateway,
  ) {}

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
  constructor(private readonly settings: AiSettingsService) {}

  @Get('status')
  status() {
    return this.settings.status();
  }
}
