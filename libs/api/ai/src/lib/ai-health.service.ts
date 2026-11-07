import { Injectable } from '@nestjs/common';
import {
  AI_KINDS,
  type AiAlert,
  type AiHealthReport,
  type AiKind,
  type AiServiceHealth,
} from '@all-in-one/shared/schemas';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Keeps memory bounded on a busy day; older events fall off first. */
const MAX_EVENTS = 20_000;
/** An error alert needs at least this many calls in the hour, and this share of them failing. */
export const ALERT_MIN_CALLS = 5;
export const ALERT_FAILURE_RATE = 0.2;
/** Fallback use worth telling the admin about: the main service is failing. */
export const ALERT_FALLBACKS = 3;
export const BUDGET_NEAR = 0.8;

interface AiEvent {
  at: number;
  ok: boolean;
  fellBack: boolean;
}

/**
 * Outcomes of real AI requests since the api started (kept in memory: a restart clears them). The admin's
 * connection tests are not recorded.
 */
@Injectable()
export class AiHealthService {
  private readonly started = new Date();
  private readonly events: Record<AiKind, AiEvent[]> = {
    chat: [],
    tts: [],
    stt: [],
  };
  private readonly lastError: AiHealthReport['lastError'] = {
    chat: null,
    tts: null,
    stt: null,
  };

  record(
    kind: AiKind,
    outcome: { ok: boolean; fellBack: boolean; error?: string },
    now = Date.now(),
  ): void {
    const list = this.events[kind];
    list.push({ at: now, ok: outcome.ok, fellBack: outcome.fellBack });
    const cutoff = now - DAY_MS;
    let drop = 0;
    while (drop < list.length && list[drop].at < cutoff) drop++;
    if (list.length - drop > MAX_EVENTS) drop = list.length - MAX_EVENTS;
    if (drop) list.splice(0, drop);
    if (outcome.error)
      this.lastError[kind] = {
        at: new Date(now).toISOString(),
        message: outcome.error.slice(0, 200),
      };
  }

  private window(kind: AiKind, ms: number, now: number): AiServiceHealth {
    const from = now - ms;
    const health = { calls: 0, failed: 0, fellBack: 0 };
    for (const event of this.events[kind]) {
      if (event.at < from) continue;
      health.calls++;
      if (!event.ok) health.failed++;
      if (event.fellBack) health.fellBack++;
    }
    return health;
  }

  report(
    budget: { todayUsd: number; dailyBudgetUsd: number },
    now = Date.now(),
  ): AiHealthReport {
    const per = (ms: number) =>
      Object.fromEntries(
        AI_KINDS.map((kind) => [kind, this.window(kind, ms, now)]),
      ) as Record<AiKind, AiServiceHealth>;
    const hour = per(HOUR_MS);
    const day = per(DAY_MS);
    const alerts: AiAlert[] = [];
    for (const service of AI_KINDS) {
      const { calls, failed, fellBack } = hour[service];
      if (calls >= ALERT_MIN_CALLS && failed / calls >= ALERT_FAILURE_RATE)
        alerts.push({ kind: 'errors', service, failed, calls });
      if (fellBack >= ALERT_FALLBACKS)
        alerts.push({ kind: 'fallback', service, fellBack });
    }
    const { todayUsd, dailyBudgetUsd } = budget;
    if (dailyBudgetUsd > 0 && todayUsd >= dailyBudgetUsd)
      alerts.push({ kind: 'budget', todayUsd, budgetUsd: dailyBudgetUsd });
    else if (dailyBudgetUsd > 0 && todayUsd >= dailyBudgetUsd * BUDGET_NEAR)
      alerts.push({ kind: 'budget-near', todayUsd, budgetUsd: dailyBudgetUsd });
    const lastError = { ...this.lastError };
    for (const kind of AI_KINDS) {
      const at = lastError[kind]?.at;
      if (at && Date.parse(at) < now - DAY_MS) lastError[kind] = null;
    }
    return {
      since: this.started.toISOString(),
      hour,
      day,
      lastError,
      todayUsd,
      alerts,
    };
  }
}
