import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { MonitorService, serverErrorEvent } from './monitor.service';

/** Reports server errors (5xx and anything unexpected) and leaves the response to Nest as before. */
@Catch()
export class MonitorFilter extends BaseExceptionFilter {
  constructor(private readonly monitor: MonitorService) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500 && host.getType() === 'http') {
      const request = host.switchToHttp().getRequest<Request>();
      const user = (request as Request & { user?: { id?: string } }).user;
      this.monitor.capture(
        serverErrorEvent(
          exception,
          { method: request.method, path: request.path, status },
          this.monitor.environment,
          this.monitor.release,
          user?.id,
        ),
      );
    }
    super.catch(exception, host);
  }
}
