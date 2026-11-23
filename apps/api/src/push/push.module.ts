import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  SHELL_HEADER,
  withShellMarkers,
} from '@all-in-one/shared/schemas';
import { PushService, type LocalReminderClient } from './push.service';
import { storeFromUserAgent } from '../in-app-notifications';
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
  /** The app asks only while its reminders are on, so each call also records the device (directive 180). */
  @Get('local-schedule')
  async localSchedule(
    @CurrentUser() user: AuthUser,
    @Query({ schema: localScheduleQuerySchema }) query: LocalScheduleQuery,
    @Headers('user-agent') userAgent?: string,
    @Headers(SHELL_HEADER.toLowerCase()) shell?: string,
  ) {
    const language = query.language ?? 'fa';
    // Defaults first, so the first schedule already holds the default reminders.
    await this.push.ensureDefaultReminders(user.id);
    const [items, trial] = await Promise.all([
      this.push.localSchedule(user.id, language),
      this.trialEnding.localReminder(user.id, language).catch(() => null),
    ]);
    const schedule = (trial ? [...items, trial] : items)
      .sort((a, b) => a.at - b.at)
      .slice(0, LOCAL_SCHEDULE_LIMIT);
    await this.push.recordLocalDevice(
      user.id,
      localClient(userAgent, shell),
      schedule.length,
    );
    return schedule;
  }
  /** Reminders turned off in the Android app. */
  @Delete('local-device')
  removeLocalDevice(
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent?: string,
    @Headers(SHELL_HEADER.toLowerCase()) shell?: string,
  ) {
    return this.push.removeLocalDevice(user.id, localClient(userAgent, shell));
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
/**
 * Store builds name themselves in the user agent (directive 120), which requests through the service worker lose, so
 * the web app's shell header counts too; any other caller is the direct APK.
 */
function localClient(
  userAgent: string | undefined,
  shell?: string,
): LocalReminderClient {
  return storeFromUserAgent(withShellMarkers(userAgent, shell)) ?? 'direct_apk';
}
@Module({
  imports: [AuthModule, PrismaModule, PlannerApiModule],
  controllers: [PushController],
  providers: [PushService, TrialEndingPush, SmsNotices],
  exports: [PushService],
})
export class PushModule {}
