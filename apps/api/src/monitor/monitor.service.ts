import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { TelegramApi } from '../telegram/telegram-api';
import { createHash, randomUUID } from 'node:crypto';
import type { ClientError } from '@all-in-one/shared/schemas';

/** A Sentry-style event, the subset GlitchTip's store endpoint needs. */
export interface MonitorEvent {
  event_id: string;
  timestamp: number;
  platform: 'node' | 'javascript' | 'dart';
  level: 'error' | 'warning';
  environment: string;
  release?: string;
  message?: string;
  exception: {
    values: {
      type: string;
      value: string;
      stacktrace?: { frames: StackFrame[] };
    }[];
  };
  fingerprint?: string[];
  tags: Record<string, string>;
  request?: { url: string };
  user?: { id: string };
}

interface StackFrame {
  filename: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
/** Dart: "#0      Foo.bar (package:app/main.dart:12:5)" (column optional). */
const DART_FRAME = /^#\d+\s+(.+?) \((.+?):(\d+)(?::(\d+))?\)\s*$/;

/** Parses V8-style "at fn (file:line:col)" and Dart "#n fn (file:line:col)" lines; others give no frames. */
export function parseStack(stack: string | undefined): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of (stack ?? '').split('\n')) {
    const m = FRAME.exec(line) ?? DART_FRAME.exec(line);
    if (!m) continue;
    frames.push({
      function: m[1],
      filename: m[2],
      lineno: Number(m[3]),
      ...(m[4] ? { colno: Number(m[4]) } : {}),
    });
  }
  // Sentry wants the oldest frame first.
  return frames.reverse().slice(-30);
}

/** Query strings and long ids vary per request; one bug must be one issue. */
export function normalisePath(path: string): string {
  return path
    .split('?')[0]
    .split('#')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
}

export function clientErrorEvent(
  input: ClientError,
  environment: string,
  userId?: string,
): MonitorEvent {
  const type =
    input.kind === 'chunk'
      ? 'ChunkLoadError'
      : (/^(\w*Error)\b/.exec(input.message)?.[1] ?? 'Error');
  const path = normalisePath(input.path);
  return {
    event_id: randomUUID().replaceAll('-', ''),
    timestamp: Date.now() / 1000,
    platform: input.app === 'native' ? 'dart' : 'javascript',
    level: 'error',
    environment,
    release: input.version,
    exception: {
      values: [
        {
          type,
          value: input.message,
          stacktrace: { frames: parseStack(input.stack) },
        },
      ],
    },
    // Without source maps stack positions change every build: group by what failed and where.
    fingerprint: [input.app, type, input.message.slice(0, 120), path],
    tags: {
      app: input.app,
      client: input.client,
      online: String(input.online),
      kind: input.kind,
    },
    request: { url: path },
    ...(userId ? { user: { id: userId } } : {}),
  };
}

export function serverErrorEvent(
  error: unknown,
  context: { method: string; path: string; status: number },
  environment: string,
  release: string | undefined,
  userId?: string,
): MonitorEvent {
  const err = error instanceof Error ? error : new Error(String(error));
  const path = normalisePath(context.path);
  return {
    event_id: randomUUID().replaceAll('-', ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment,
    release,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: { frames: parseStack(err.stack) },
        },
      ],
    },
    fingerprint: [
      'api',
      err.name,
      context.method,
      path,
      createHash('sha1')
        .update(err.message.slice(0, 80))
        .digest('hex')
        .slice(0, 8),
    ],
    tags: {
      app: 'api',
      status: String(context.status),
      method: context.method,
    },
    request: { url: path },
    ...(userId ? { user: { id: userId } } : {}),
  };
}

/**
 * Sends events to GlitchTip on the server's loopback (deploy/compose.yml). Reporting never throws and
 * never waits on a response a request needs: a failed or missing GlitchTip must not break the app.
 * Without GLITCHTIP_DSN events only go to the log.
 */
@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);
  private readonly target?: { url: string; key: string };
  readonly environment: string;
  readonly release?: string;
  private readonly telegram: TelegramApi;
  private readonly alertChatIds: string[];
  /** Fingerprints already announced, with the time: a problem is announced once a day, not per event. */
  private readonly announced = new Map<string, number>();
  private announcedWindow: number[] = [];

  constructor(
    config: ConfigService,
    private readonly prisma?: PrismaService,
  ) {
    // Dedicated dev/ops bot (poshtetgarm_develop_bot, directive 186); never the customer bot (TELEGRAM_BOT_TOKEN).
    this.telegram = new TelegramApi(config, 'MONITOR_TELEGRAM_BOT_TOKEN');
    this.alertChatIds = (config.get<string>('MONITOR_TELEGRAM_CHAT_ID') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this.environment = config.get<string>('NODE_ENV') ?? 'development';
    this.release = config.get<string>('APP_RELEASE') || undefined;
    const dsn = config.get<string>('GLITCHTIP_DSN');
    if (dsn) {
      // http://<key>@127.0.0.1:4340/<project id>
      const u = new URL(dsn);
      const project = u.pathname.replace(/^\//, '');
      this.target = {
        url: `${u.protocol}//${u.host}/api/${project}/store/`,
        key: u.username,
      };
    }
  }

  get enabled(): boolean {
    return !!this.target;
  }

  /** Tells the dev/ops bot chats about a problem not seen in the last day. Never throws. */
  private async announce(event: MonitorEvent): Promise<void> {
    try {
      if (!this.telegram.enabled) return;
      if (!this.alertChatIds.length && !this.prisma) return;
      const key = (event.fingerprint ?? [event.exception.values[0].value]).join(
        '|',
      );
      const now = Date.now();
      const last = this.announced.get(key);
      if (last !== undefined && now - last < ALERT_REPEAT_MS) return;
      this.announcedWindow = this.announcedWindow.filter(
        (t) => now - t < 3_600_000,
      );
      if (this.announcedWindow.length >= ALERT_MAX_PER_HOUR) return;
      this.announced.set(key, now);
      this.announcedWindow.push(now);
      if (this.announced.size > 500)
        this.announced.delete(this.announced.keys().next().value!);
      const chatIds: Array<bigint | string> = this.alertChatIds.length
        ? this.alertChatIds
        : (
            await this.prisma!.telegramLink.findMany({
              where: { user: { role: 'ADMIN' } },
              select: { chatId: true },
            })
          ).map((l) => l.chatId);
      if (!chatIds.length) return;
      const text = alertText(event);
      await Promise.all(
        chatIds.map((chatId) =>
          this.telegram.sendMessage(chatId, text).catch(() => undefined),
        ),
      );
    } catch (e) {
      this.logger.warn(`Alert not sent: ${(e as Error).message}`);
    }
  }

  capture(event: MonitorEvent): void {
    void this.announce(event);
    if (!this.target) return;
    const { url, key } = this.target;
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_client=aio-monitor/1, sentry_key=${key}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok)
          this.logger.warn(`GlitchTip refused an event: ${response.status}`);
      })
      .catch((e: unknown) =>
        this.logger.warn(`GlitchTip unreachable: ${(e as Error).message}`),
      );
  }
}

export const ALERT_REPEAT_MS = 24 * 3_600_000;
/** Whatever happens, at most this many alerts an hour (a flood of new errors must not flood the owner). */
export const ALERT_MAX_PER_HOUR = 5;

/** The text sent to Telegram: what failed and where, nothing that identifies a person. */
export function alertText(event: MonitorEvent): string {
  const e = event.exception.values[0];
  const where = event.request?.url ?? '';
  return [
    `⚠️ خطای تازه در ${event.tags['app'] ?? 'app'}`,
    `${e.type}: ${e.value}`.slice(0, 300),
    [
      where,
      event.release ? `نسخه ${event.release}` : '',
      event.tags['client'] ?? '',
    ]
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}
