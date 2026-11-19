import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  Put,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthModule, CurrentUser, type AuthUser } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import {
  focusPushTimerSchema,
  pushSubscriptionSchema,
  progressNotificationSchema,
  type ProgressNotificationInput,
  reviewReminderSchema,
  type ReviewReminderSettings,
  removePushSchema,
  type PushSubscriptionInput,
  nativePushSchema,
  type NativePushInput,
  localScheduleQuerySchema,
  LOCAL_SCHEDULE_LIMIT,
  type LocalScheduleQuery,
} from '@all-in-one/shared/schemas';
import { PushService } from './push.service';
import { SmsNotices } from './sms-notices';
import { TrialEndingPush } from './trial-ending';

@Controller('push')
class PushController {
  constructor(
    private readonly push: PushService,
    private readonly trialEnding: TrialEndingPush,
  ) {}
  @Get('review-settings') reviewSettings(@CurrentUser() user: AuthUser) {
    return this.push.reviewSettings(user.id);
  }
  @Put('review-settings') updateReviewSettings(
    @CurrentUser() user: AuthUser,
    @Body({ schema: reviewReminderSchema }) input: ReviewReminderSettings,
  ) {
    return this.push.updateReviewSettings(user.id, input);
  }
  @Get('progress-settings')
  progressSettings(@CurrentUser() user: AuthUser) {
    return this.push.progressSettings(user.id);
  }
  @Put('progress-settings')
  updateProgressSettings(
    @CurrentUser() user: AuthUser,
    @Body({ schema: progressNotificationSchema })
    input: ProgressNotificationInput,
  ) {
    return this.push.updateProgressSettings(user.id, input);
  }
  /** Upcoming timed reminders for the Android app to schedule on the device (Google push is blocked in Iran). */
  @Get('local-schedule')
  async localSchedule(
    @CurrentUser() user: AuthUser,
    @Query({ schema: localScheduleQuerySchema }) query: LocalScheduleQuery,
  ) {
    const language = query.language ?? 'fa';
    const [items, trial] = await Promise.all([
      this.push.localSchedule(user.id, language),
      this.trialEnding.localReminder(user.id, language).catch(() => null),
    ]);
    return (trial ? [...items, trial] : items)
      .sort((a, b) => a.at - b.at)
      .slice(0, LOCAL_SCHEDULE_LIMIT);
  }
  @Get('weekly-progress')
  weeklyProgress(@CurrentUser() user: AuthUser) {
    return this.push.weeklyProgress(user.id);
  }
  @Post('focus-timers')
  scheduleFocus(
    @CurrentUser() user: AuthUser,
    @Body({ schema: focusPushTimerSchema }) input: { remainingMs: number },
  ) {
    return this.push.scheduleFocus(user.id, input.remainingMs);
  }
  @Delete('focus-timers/:id')
  cancelFocus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.push.cancelFocus(user.id, id);
  }
  @Get('status') status() {
    return this.push.status();
  }
  @Put('subscription') subscribe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pushSubscriptionSchema }) input: PushSubscriptionInput,
  ) {
    return this.push.subscribe(user.id, input);
  }
  @Post('unsubscribe') remove(
    @CurrentUser() user: AuthUser,
    @Body({ schema: removePushSchema }) input: { endpoint: string },
  ) {
    return this.push.remove(user.id, input.endpoint);
  }
  @Put('native/subscription') subscribeNative(
    @CurrentUser() user: AuthUser,
    @Body({ schema: nativePushSchema }) input: NativePushInput,
  ) {
    return this.push.subscribeNative(user.id, input);
  }
  @Post('test')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  test(
    @CurrentUser() user: AuthUser,
    @Body({ schema: removePushSchema }) input: { endpoint: string },
  ) {
    return this.push.test(user.id, input.endpoint);
  }
}
@Module({
  imports: [AuthModule, PrismaModule, PlannerApiModule],
  controllers: [PushController],
  providers: [PushService, TrialEndingPush, SmsNotices],
  exports: [PushService],
})
export class PushModule {}
