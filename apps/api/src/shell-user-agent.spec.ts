import { shellUserAgentOf } from './shell-user-agent';

describe('shell-aware user agent', () => {
  const wv = 'Mozilla/5.0 (Linux; Android 14; SM-A556E; wv) Chrome/157.0';
  it('restores the store marker the service worker dropped', () => {
    expect(
      shellUserAgentOf({
        'user-agent': wv,
        'x-aio-shell': 'PoshtetgarmApp/1.0.7 PoshtetgarmStore/myket',
      }),
    ).toBe(`${wv} PoshtetgarmApp/1.0.7 PoshtetgarmStore/myket`);
  });
  it('keeps a plain user agent and ignores anything but shell markers', () => {
    expect(shellUserAgentOf({ 'user-agent': wv })).toBe(wv);
    expect(
      shellUserAgentOf({ 'user-agent': wv, 'x-aio-shell': 'Admin true' }),
    ).toBe(wv);
  });
});
