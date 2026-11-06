import { OnboardingService } from '../app/onboarding.service';
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
    private readonly onboarding: OnboardingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
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
    const healthActivity =
      req.method === 'POST' &&
      ['/api/health/meals', '/api/health/workouts'].includes(path);
    if ((!name && !healthActivity) || !req.user) return next.handle();
    const analyticsEnabled =
      this.config.get<string>('GROWTH_ANALYTICS_ENABLED') === 'true' &&
      !/(?:^|;\s*)aio_growth_(?:preference|consent)=denied(?:;|$)/.test(
        String(req.headers?.cookie ?? ''),
      );
    const cookie = String(req.headers?.cookie ?? '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('aio_growth_visitor='));
    const visitorId = cookie?.slice('aio_growth_visitor='.length);
    const track = analyticsEnabled && z.uuid().safeParse(visitorId).success;
    return next.handle().pipe(
      mergeMap(async (result) => {
        try {
          await this.onboarding.complete(
            req.user.id,
            name === 'first_task_created'
              ? 'planner'
              : name === 'first_review_completed'
                ? 'english'
                : 'health',
          );
        } catch {
          this.logger.warn('First-action progress could not be recorded');
        }
        try {
          if (track)
            await this.growth.recordActivity(
              visitorId as string,
              String(req.headers?.['accept-language'] ?? '').startsWith('en')
                ? 'en'
                : 'fa',
              name,
            );
        } catch {
          this.logger.warn('Growth activity event could not be recorded');
        }
        return result;
      }),
    );
  }
}
