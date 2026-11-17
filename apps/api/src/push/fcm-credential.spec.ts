import type { Credential, GoogleOAuthAccessToken } from 'firebase-admin/app';
import {
  EarlyRenewCredential,
  FCM_RENEW_EVERY_MS,
  FCM_TOKEN_TIMEOUT_MS,
} from './fcm-credential';

const HOUR = 3600;

function setup() {
  let clock = 1_000_000;
  const results: (() => Promise<GoogleOAuthAccessToken>)[] = [];
  let issued = 0;
  const source: Credential = {
    getAccessToken: vi.fn(() => {
      const next = results.shift();
      if (next) return next();
      issued += 1;
      return Promise.resolve({ access_token: `t${issued}`, expires_in: HOUR });
    }),
  };
  const failed = vi.fn();
  const credential = new EarlyRenewCredential(source, failed, () => clock);
  return {
    credential,
    source,
    failed,
    advance: (ms: number) => (clock += ms),
    failNext: () =>
      results.push(() => Promise.reject(new Error('connect ETIMEDOUT'))),
    hangNext: () => results.push(() => new Promise(() => undefined)),
  };
}

describe('EarlyRenewCredential', () => {
  afterEach(() => vi.useRealTimers());

  it('reuses a valid token and reports the time it has left', async () => {
    const { credential, source, advance } = setup();
    expect(await credential.getAccessToken()).toEqual({
      access_token: 't1',
      expires_in: HOUR,
    });
    advance(10 * 60_000);
    expect(await credential.getAccessToken()).toEqual({
      access_token: 't1',
      expires_in: HOUR - 600,
    });
    expect(source.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('keeps sending with the current token while a renewal fails', async () => {
    const { credential, advance, failNext } = setup();
    await credential.getAccessToken();
    advance((HOUR - 30) * 1000); // 30 s left: a send tries to renew first
    failNext();
    expect((await credential.getAccessToken()).access_token).toBe('t1');
  });

  it('fails only once the token has really expired', async () => {
    const { credential, advance, failNext } = setup();
    await credential.getAccessToken();
    advance(HOUR * 1000);
    failNext();
    await expect(credential.getAccessToken()).rejects.toThrow('ETIMEDOUT');
    expect((await credential.getAccessToken()).access_token).toBe('t2');
  });

  it('renews in the background ahead of expiry and retries after an outage', async () => {
    vi.useFakeTimers();
    const { credential, source, failed, advance, failNext } = setup();
    credential.start(); // warms the first token
    await vi.advanceTimersByTimeAsync(0);
    expect(source.getAccessToken).toHaveBeenCalledTimes(1);

    advance(20 * 60_000); // 40 min left: nothing to do yet
    await vi.advanceTimersByTimeAsync(FCM_RENEW_EVERY_MS);
    expect(source.getAccessToken).toHaveBeenCalledTimes(1);

    advance(15 * 60_000); // under 30 min left: renew, but Google is unreachable
    failNext();
    await vi.advanceTimersByTimeAsync(FCM_RENEW_EVERY_MS);
    expect(source.getAccessToken).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FCM_RENEW_EVERY_MS); // next check succeeds
    expect(source.getAccessToken).toHaveBeenCalledTimes(3);
    expect((await credential.getAccessToken()).access_token).toBe('t2');
    credential.stop();
  });

  it('gives up on a hung request so the next check can try again', async () => {
    vi.useFakeTimers();
    const { credential, source, failed, hangNext } = setup();
    hangNext();
    credential.start();
    await vi.advanceTimersByTimeAsync(FCM_TOKEN_TIMEOUT_MS);
    expect(failed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(FCM_RENEW_EVERY_MS);
    expect(source.getAccessToken).toHaveBeenCalledTimes(2);
    expect((await credential.getAccessToken()).access_token).toBe('t1');
    credential.stop();
  });
});
