import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { ClientError } from '@all-in-one/shared/schemas';
import {
  ALERT_MAX_PER_HOUR,
  alertText,
  MonitorService,
  clientErrorEvent,
  normalisePath,
  parseStack,
  serverErrorEvent,
} from './monitor.service';

const base: ClientError = {
  app: 'customer',
  kind: 'chunk',
  message: 'Loading chunk 12 failed',
  path: '/app/planner/tasks/42?x=1',
  version: '0.1.7',
  client: 'bazaar',
  online: false,
};

describe('monitor events', () => {
  it('parses V8 stacks oldest frame first', () => {
    const frames = parseStack(
      'Error: x\n    at a (https://h/main.js:1:2)\n    at https://h/chunk.js:3:4',
    );
    expect(frames).toEqual([
      {
        function: undefined,
        filename: 'https://h/chunk.js',
        lineno: 3,
        colno: 4,
      },
      { function: 'a', filename: 'https://h/main.js', lineno: 1, colno: 2 },
    ]);
  });

  it('drops query strings and ids from the path', () => {
    expect(normalisePath('/api/tasks/123?token=secret')).toBe('/api/tasks/:n');
    expect(normalisePath('/x/3f2c1a9e-1b2c-4d5e-8f90-a1b2c3d4e5f6/y')).toBe(
      '/x/:id/y',
    );
  });

  it('groups a client error by app, type, message and path, with no stack positions', () => {
    const a = clientErrorEvent(base, 'production');
    const b = clientErrorEvent(
      { ...base, stack: 'Error\n    at f (a.js:9:9)' },
      'production',
    );
    expect(a.fingerprint).toEqual(b.fingerprint);
    expect(a.exception.values[0].type).toBe('ChunkLoadError');
    expect(a.request?.url).toBe('/app/planner/tasks/:n');
    expect(a.tags).toMatchObject({ client: 'bazaar', online: 'false' });
  });

  it('builds a server event with the route and status', () => {
    const e = serverErrorEvent(
      new TypeError('boom'),
      { method: 'POST', path: '/api/x/5', status: 500 },
      'production',
      'abc123',
      'user-1',
    );
    expect(e.release).toBe('abc123');
    expect(e.user).toEqual({ id: 'user-1' });
    expect(e.fingerprint?.slice(0, 4)).toEqual([
      'api',
      'TypeError',
      'POST',
      '/api/x/:n',
    ]);
  });
});

describe('MonitorService', () => {
  const config = (v: Record<string, string>) =>
    ({ get: (k: string) => v[k] }) as unknown as ConfigService;

  it('does nothing without a DSN', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const m = new MonitorService(config({}));
    m.capture(clientErrorEvent(base, 'test'));
    expect(m.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('posts to the store endpoint with the key and survives a failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('down'));
    const m = new MonitorService(
      config({ GLITCHTIP_DSN: 'http://abc@127.0.0.1:4340/1' }),
    );
    m.capture(clientErrorEvent(base, 'test'));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4340/api/1/store/');
    expect(
      (init?.headers as Record<string, string>)['x-sentry-auth'],
    ).toContain('sentry_key=abc');
    await Promise.resolve();
    fetchSpy.mockRestore();
  });
});

describe('Telegram alerts', () => {
  const config = (v: Record<string, string>) =>
    ({ get: (k: string) => v[k] }) as unknown as ConfigService;
  const event = (message: string) =>
    clientErrorEvent({ ...base, kind: 'error', message }, 'production');

  function setup(env: Record<string, string> = {}) {
    const findMany = vi.fn().mockResolvedValue([{ chatId: 7n }]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true,"result":{}}'));
    const m = new MonitorService(
      config({
        MONITOR_TELEGRAM_BOT_TOKEN: 'dev-token',
        NODE_ENV: 'production',
        ...env,
      }),
      { telegramLink: { findMany } } as never,
    );
    return { m, findMany, fetchSpy };
  }

  it('tells admins once per problem through the monitor bot and has no personal data', async () => {
    const { m, findMany, fetchSpy } = setup();
    m.capture(event('TypeError: a'));
    m.capture(event('TypeError: a'));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('/botdev-token/sendMessage');
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.chat_id).toBe('7');
    expect(body.text).toContain('TypeError: a');
    fetchSpy.mockRestore();
  });

  it('does not fall back to the customer bot token when MONITOR_TELEGRAM_BOT_TOKEN is unset', async () => {
    const findMany = vi.fn().mockResolvedValue([{ chatId: 7n }]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true,"result":{}}'));
    const m = new MonitorService(
      config({ TELEGRAM_BOT_TOKEN: 'customer-token', NODE_ENV: 'production' }),
      { telegramLink: { findMany } } as never,
    );
    m.capture(event('TypeError: a'));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends to MONITOR_TELEGRAM_CHAT_ID directly when configured', async () => {
    const { m, findMany, fetchSpy } = setup({
      MONITOR_TELEGRAM_CHAT_ID: '12345',
    });
    m.capture(event('TypeError: a'));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(findMany).not.toHaveBeenCalled();
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.chat_id).toBe('12345');
    fetchSpy.mockRestore();
  });

  it('caps a flood of new errors', async () => {
    const { m, fetchSpy } = setup();
    for (let i = 0; i < ALERT_MAX_PER_HOUR + 3; i++) m.capture(event(`E${i}`));
    await vi.waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledTimes(ALERT_MAX_PER_HOUR),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).toHaveBeenCalledTimes(ALERT_MAX_PER_HOUR);
    fetchSpy.mockRestore();
  });

  it('formats the alert', () => {
    expect(alertText(event('TypeError: a'))).toContain('customer');
  });
});
