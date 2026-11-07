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
import {
  CurrentUser,
  Public,
  Roles,
  type AuthUser,
} from '@all-in-one/api/auth';
import {
  growthEventSchema,
  growthCampaignFilterSchema,
  growthRetentionFilterSchema,
  type GrowthCampaignFilter,
  type GrowthEventInput,
  type GrowthRetentionFilter,
  type GrowthReportAuditEntry,
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

  private async auditedView<T>(
    admin: AuthUser,
    report: GrowthReportAuditEntry['report'],
    result: Promise<T>,
  ): Promise<T> {
    const data = await result;
    await this.growth.auditReport(admin.id, report, 'VIEW');
    return data;
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Post('campaigns/export-audit')
  async auditCampaignExport(@CurrentUser() admin: AuthUser): Promise<void> {
    this.requireEnabled();
    await this.growth.auditReport(admin.id, 'CAMPAIGNS', 'EXPORT');
  }

  @Roles('ADMIN')
  @Get('monitoring')
  monitoring() {
    this.requireEnabled();
    return this.growth.monitoring();
  }

  @Roles('ADMIN')
  @Get('campaigns')
  campaigns(
    @CurrentUser() admin: AuthUser,
    @Query({ schema: growthCampaignFilterSchema })
    filter: GrowthCampaignFilter = {},
  ) {
    this.requireEnabled();
    return this.auditedView(admin, 'CAMPAIGNS', this.growth.campaigns(filter));
  }

  @Roles('ADMIN')
  @Get('retention-cohorts')
  retentionCohorts(
    @CurrentUser() admin: AuthUser,
    @Query({ schema: growthRetentionFilterSchema })
    filter: GrowthRetentionFilter = {},
  ) {
    this.requireEnabled();
    return this.auditedView(
      admin,
      'RETENTION',
      this.growth.retentionCohorts(filter),
    );
  }

  @Roles('ADMIN')
  @Get('churn')
  churn(@CurrentUser() admin: AuthUser) {
    this.requireEnabled();
    return this.auditedView(admin, 'CHURN', this.growth.churn());
  }

  @Roles('ADMIN')
  @Get('summary')
  summary(@CurrentUser() admin: AuthUser) {
    this.requireEnabled();
    return this.auditedView(admin, 'SUMMARY', this.growth.summary());
  }
}
