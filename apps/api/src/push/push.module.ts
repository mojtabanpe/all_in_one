import { Body, Controller, Get, Module, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import {
  pushSubscriptionSchema,
  reviewReminderSchema,
  type ReviewReminderSettings,
  removePushSchema,
  type PushSubscriptionInput,
  nativePushSchema,
  type NativePushInput,
} from '@all-in-one/shared/schemas';
import { PushService } from './push.service';

@Controller('push')
class PushController {
  constructor(private readonly push: PushService) {}
  @Get('review-settings') reviewSettings(@CurrentUser() user: AuthUser) {
    return this.push.reviewSettings(user.id);
  }
  @Put('review-settings') updateReviewSettings(
    @CurrentUser() user: AuthUser,
    @Body({ schema: reviewReminderSchema }) input: ReviewReminderSettings,
  ) {
    return this.push.updateReviewSettings(user.id, input);
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
  imports: [PrismaModule, PlannerApiModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
