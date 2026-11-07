import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  MailService,
  Public,
  Roles,
  type AuthUser,
} from '@all-in-one/api/auth';
import {
  billingAccountQuerySchema,
  billingAdjustmentSchema,
  billingAdminOrdersQuerySchema,
  billingCheckoutSchema,
  billingPlanInputSchema,
  billingRefundSchema,
  billingRewardSchema,
  billingRewardRequestSchema,
  type BillingRewardRequestInput,
  type BillingRewardInput,
  type BillingAccountQuery,
  type BillingAdjustmentInput,
  type BillingAdminOrdersQuery,
  type BillingCheckoutInput,
  type BillingPlanInput,
  type BillingRefundInput,
} from '@all-in-one/shared/schemas';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public prices (only active plans). */
  @Public()
  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.billing.subscription(user.id);
  }

  @Get('access')
  access(@CurrentUser() user: AuthUser) {
    return this.billing.access(user.id);
  }

  @Get('reward-offers')
  rewardOffers(@CurrentUser() user: AuthUser) {
    return this.billing.rewardOffers(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reward-requests')
  requestReward(
    @CurrentUser() user: AuthUser,
    @Body({ schema: billingRewardRequestSchema })
    input: BillingRewardRequestInput,
  ) {
    return this.billing.requestReward(user.id, input);
  }

  @Get('orders')
  orders(@CurrentUser() user: AuthUser) {
    return this.billing.orders(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body({ schema: billingCheckoutSchema }) input: BillingCheckoutInput,
  ) {
    return this.billing.checkout(user.id, input.plan);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders/:id/verify')
  async recheck(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { status: await this.billing.recheck(user.id, id) };
  }

  @Roles('ADMIN')
  @Get('admin/plans')
  adminPlans() {
    return this.billing.adminPlans();
  }

  @Roles('ADMIN')
  @Get('admin/orders')
  adminOrders(
    @Query({ schema: billingAdminOrdersQuerySchema })
    query: BillingAdminOrdersQuery,
  ) {
    return this.billing.adminOrders(query);
  }

  @Roles('ADMIN')
  @Get('admin/metrics')
  metrics() {
    return this.billing.metrics();
  }

  @Roles('ADMIN')
  @Get('admin/account')
  account(
    @Query({ schema: billingAccountQuerySchema }) query: BillingAccountQuery,
  ) {
    return this.billing.account(query.email);
  }

  @Roles('ADMIN')
  @Post('admin/adjustments')
  adjust(
    @CurrentUser() admin: AuthUser,
    @Body({ schema: billingAdjustmentSchema }) input: BillingAdjustmentInput,
  ) {
    return this.billing.adjust(admin.id, input);
  }

  @Roles('ADMIN')
  @Post('admin/refunds')
  refund(
    @CurrentUser() admin: AuthUser,
    @Body({ schema: billingRefundSchema }) input: BillingRefundInput,
  ) {
    return this.billing.refund(admin.id, input);
  }

  @Roles('ADMIN')
  @Get('admin/reward-requests')
  pendingRewards() {
    return this.billing.pendingRewards();
  }

  @Roles('ADMIN')
  @Delete('admin/reward-requests/:id')
  @HttpCode(204)
  dismissRewardRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.dismissRewardRequest(id);
  }

  @Roles('ADMIN')
  @Post('admin/rewards')
  grantReward(
    @CurrentUser() admin: AuthUser,
    @Body({ schema: billingRewardSchema }) input: BillingRewardInput,
  ) {
    return this.billing.grantReward(admin.id, input);
  }

  @Roles('ADMIN')
  @Put('admin/plans')
  savePlan(@Body({ schema: billingPlanInputSchema }) input: BillingPlanInput) {
    return this.billing.savePlan(input);
  }
}

/** Zibal sends the browser here (`ZIBAL_CALLBACK_URL`) after payment or cancellation. */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly billing: BillingService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('callback')
  @Redirect()
  async callback(@Query('trackId') trackId: unknown) {
    const status = await this.billing.settle(
      typeof trackId === 'string' ? trackId : '',
    );
    const url = new URL('billing', this.mail.appUrl);
    url.searchParams.set('payment', status);
    return { url: url.href, statusCode: 303 };
  }
}
