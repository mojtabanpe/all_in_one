import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles } from '@all-in-one/api/auth';
import {
  growthEventSchema,
  growthCampaignFilterSchema,
  type GrowthCampaignFilter,
  type GrowthEventInput,
} from '@all-in-one/shared/schemas';
import { GrowthService } from './growth.service';

@Controller('growth')
export class GrowthController {
  constructor(
    private readonly growth: GrowthService,
    private readonly config: ConfigService,
  ) {}

  private requireEnabled(): void {
    if (this.config.get<string>('GROWTH_ANALYTICS_ENABLED') !== 'true')
      throw new NotFoundException();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(204)
  @Post('events')
  async record(@Body({ schema: growthEventSchema }) input: GrowthEventInput) {
    this.requireEnabled();
    await this.growth.record(input);
  }

  @Roles('ADMIN')
  @Get('campaigns')
  campaigns(
    @Query({ schema: growthCampaignFilterSchema })
    filter: GrowthCampaignFilter = {},
  ) {
    this.requireEnabled();
    return this.growth.campaigns(filter);
  }

  @Roles('ADMIN')
  @Get('retention-cohorts')
  retentionCohorts() {
    this.requireEnabled();
    return this.growth.retentionCohorts();
  }

  @Roles('ADMIN')
  @Get('summary')
  summary() {
    this.requireEnabled();
    return this.growth.summary();
  }
}
