import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, type AuthUser } from '@all-in-one/api/auth';
import {
  clientErrorBatchSchema,
  type ClientErrorBatch,
} from '@all-in-one/shared/schemas';
import { MonitorService, clientErrorEvent } from './monitor.service';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  /** Browser and app errors. Open to signed-out visitors too (a login page can fail), so it is throttled. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('errors')
  report(
    @Body({ schema: clientErrorBatchSchema }) batch: ClientErrorBatch,
    @CurrentUser() user?: AuthUser,
  ): void {
    for (const error of batch.errors)
      this.monitor.capture(
        clientErrorEvent(error, this.monitor.environment, user?.id),
      );
  }
}
