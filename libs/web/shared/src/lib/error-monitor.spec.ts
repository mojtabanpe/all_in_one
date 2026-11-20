import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkFailure, provideErrorMonitor } from './error-monitor';

describe('isChunkFailure', () => {
  it.each([
    'Loading chunk 12 failed.',
    'TypeError: Failed to fetch dynamically imported module: https://x/a.js',
    'ChunkLoadError: boom',
    'error loading dynamically imported module',
  ])('recognises %s', (m) => expect(isChunkFailure(m)).toBe(true));

  it('ignores other errors', () =>
    expect(isChunkFailure('TypeError: x is undefined')).toBe(false));
});

describe('ErrorMonitor', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    TestBed.configureTestingModule({
      providers: [provideErrorMonitor('customer')],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends a report with the path, version and client, once per message', async () => {
    const handler = TestBed.inject(ErrorHandler);
    handler.handleError(new TypeError('x is undefined'));
    handler.handleError(new TypeError('x is undefined'));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({
      app: 'customer',
      kind: 'error',
      message: 'TypeError: x is undefined',
    });
    expect(Object.keys(body.errors[0]).sort()).toEqual(
      [
        'age',
        'app',
        'client',
        'kind',
        'message',
        'online',
        'path',
        'stack',
        'version',
      ].sort(),
    );
    expect(localStorage.getItem('aio_error_queue')).toBeNull();
  });

  it('keeps the report queued while the server is unreachable', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'));
    TestBed.inject(ErrorHandler).handleError(new Error('boom'));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem('aio_error_queue')!)).toHaveLength(
      1,
    );
  });

  it('marks a failed chunk', async () => {
    TestBed.inject(ErrorHandler).handleError(
      new Error('Failed to fetch dynamically imported module: /a.js'),
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.errors[0].kind).toBe('chunk');
  });
});
