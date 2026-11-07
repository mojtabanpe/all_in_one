import { Controller, Get } from '@nestjs/common';
import { AiSettingsService } from './ai-settings.service';

@Controller('ai')
export class AiController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get('status')
  status() {
    return this.settings.status();
  }
}
