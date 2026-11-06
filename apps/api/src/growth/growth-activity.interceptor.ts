import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mergeMap } from 'rxjs';
import * as z from 'zod/mini';
import { GrowthService } from './growth.service';

/** Observe successful authenticated HTTP actions without importing applets. */
@Injectable()
export class GrowthActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GrowthActivityInterceptor.name);
  constructor(
    private readonly growth: GrowthService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (
      context.getType() !== 'http' ||
      this.config.get<string>('GROWTH_ANALYTICS_ENABLED') !== 'true'
    )
      return next.handle();
    const req = context.switchToHttp().getRequest();
    const path = (req.originalUrl ?? req.url ?? '')
      .split('?')[0]
      .replace(/\/$/, '');
    const name =
      req.method === 'POST' && path === '/api/planner/tasks'
        ? 'first_task_created'
        : req.method === 'POST' &&
            /^\/api\/english\/cards\/[^/]+\/review$/.test(path)
          ? 'first_review_completed'
          : undefined;
    if (!name || !req.user) return next.handle();
    if (
      /(?:^|;\s*)aio_growth_(?:preference|consent)=denied(?:;|$)/.test(
        String(req.headers?.cookie ?? ''),
      )
    )
      return next.handle();
    const cookie = String(req.headers?.cookie ?? '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('aio_growth_visitor='));
    const visitorId = cookie?.slice('aio_growth_visitor='.length);
    if (!z.uuid().safeParse(visitorId).success) return next.handle();
    return next.handle().pipe(
      mergeMap(async (result) => {
        try {
          await this.growth.recordMilestone(
            visitorId as string,
            name,
            String(req.headers?.['accept-language'] ?? '').startsWith('en')
              ? 'en'
              : 'fa',
          );
        } catch {
          this.logger.warn('Growth activity event could not be recorded');
        }
        return result;
      }),
    );
  }
}
