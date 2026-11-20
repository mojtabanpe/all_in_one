import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import type { ClientError } from '@all-in-one/shared/schemas';

/** A Sentry-style event, the subset GlitchTip's store endpoint needs. */
export interface MonitorEvent {
  event_id: string;
  timestamp: number;
  platform: 'node' | 'javascript';
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

/** Parses V8-style "at fn (file:line:col)" lines; other engines fall back to no frames. */
export function parseStack(stack: string | undefined): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of (stack ?? '').split('\n')) {
    const m = FRAME.exec(line);
    if (!m) continue;
    frames.push({
      function: m[1],
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
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
    platform: 'javascript',
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

  constructor(config: ConfigService) {
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

  capture(event: MonitorEvent): void {
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
