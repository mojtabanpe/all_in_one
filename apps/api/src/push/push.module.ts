import { Body, Controller, Get, Module, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '@all-in-one/api/auth';
import { PrismaModule } from '@all-in-one/api/db';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import {
  pushSubscriptionSchema,
  removePushSchema,
  type PushSubscriptionInput,
} from '@all-in-one/shared/schemas';
import { PushService } from './push.service';

@Controller('push')
class PushController {
  constructor(private readonly push: PushService) {}
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
