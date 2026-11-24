import {
  BadGatewayException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_SERVICE_NAMES, AiGateway } from '@all-in-one/api/ai';
import { AI_KINDS, type AiKind } from '@all-in-one/shared/schemas';
import { MonitorService, serverErrorEvent } from './monitor.service';

export const AI_HEALTH_INITIAL_DELAY_MS = 30_000;
export const AI_HEALTH_PROBE_INTERVAL_MS = 15 * 60_000;

/**
 * Periodically probes configured AI service endpoints (`chat`, `tts`, `stt`) with zero-cost `HEAD`
 * requests and sends an alert through `MonitorService` (`poshtetgarm_develop_bot` + GlitchTip) before
 * a customer hits an unreachable upstream.
 */
@Injectable()
export class AiHealthMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiHealthMonitorService.name);
  private readonly failing = new Set<AiKind>();
  private startupTimer?: ReturnType<typeof setTimeout>;
  private intervalTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    private readonly monitor: MonitorService,
    @Optional() private readonly ai?: AiGateway,
  ) {}

  async check(): Promise<void> {
    if (!this.ai) return;
    const results = await this.ai.probeAll();
    for (const kind of AI_KINDS) {
      const outcome = results[kind];
      const fingerprint = ['api', 'ai-health', kind];
      if (!outcome?.configured) {
        this.failing.delete(kind);
        continue;
      }
      if (!outcome.ok) {
        if (this.failing.has(kind)) continue;
        this.failing.add(kind);
        const reason = outcome.error ?? 'unreachable';
        const error = new BadGatewayException(
          `${AI_SERVICE_NAMES[kind]} در دسترس نیست (${reason}).`,
        );
        const event = {
          ...serverErrorEvent(
            error,
            { method: 'HEAD', path: `/api/ai/health/${kind}`, status: 502 },
            this.monitor.environment,
            this.monitor.release,
          ),
          fingerprint,
        };
        this.monitor.capture(event);
      } else if (this.failing.has(kind)) {
        this.failing.delete(kind);
        this.monitor.forgetFingerprint(fingerprint);
      }
    }
  }

  onModuleInit(): void {
    if (
      !this.ai ||
      this.config.get<string>('NODE_ENV') === 'test' ||
      this.config.get<string>('AI_HEALTH_PROBE_ENABLED') === 'false'
    )
      return;
    const sweep = () =>
      void this.check().catch((e: unknown) =>
        this.logger.warn(
          `AI health probe sweep failed: ${(e as Error).message}`,
        ),
      );
    this.startupTimer = setTimeout(sweep, AI_HEALTH_INITIAL_DELAY_MS);
    this.startupTimer.unref();
    this.intervalTimer = setInterval(sweep, AI_HEALTH_PROBE_INTERVAL_MS);
    this.intervalTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }
}
