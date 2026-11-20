import assert from 'node:assert/strict';
import test from 'node:test';
import { round, step } from './worker.js';

test('round retries each failed check once and ignores transient failures', async () => {
  const attempts = new Map();
  const failures = await round(
    'https://poshtetgarm.ir',
    async (_site, check) => {
      const n = (attempts.get(check.path) ?? 0) + 1;
      attempts.set(check.path, n);
      if (check.path === '/api/health') return n === 1 ? 'api: HTTP 502' : null;
      if (check.path === '/') return 'سایت: HTTP 503';
      return null;
    },
  );
  assert.deepEqual(failures, ['سایت: HTTP 503']);
  assert.equal(attempts.get('/api/health'), 2);
  assert.equal(attempts.get('/'), 2);
  assert.equal(attempts.get('/app/'), 1);
});

test('step alerts on 2 consecutive failed rounds, reminds hourly, and reports recovery', () => {
  const t0 = 1_700_000_000_000;
  const r1 = step(null, ['api: HTTP 502'], t0);
  assert.equal(r1.msg, null);
  assert.equal(r1.state.fails, 1);

  const r2 = step(r1.state, ['api: HTTP 502'], t0 + 5 * 60_000);
  assert.match(r2.msg ?? '', /در دسترس نیست/);
  assert.equal(r2.state.alertedAt, t0 + 5 * 60_000);

  const r3 = step(r2.state, ['api: HTTP 502'], t0 + 30 * 60_000);
  assert.equal(r3.msg, null);

  const r4 = step(r3.state, ['api: HTTP 502'], t0 + 65 * 60_000);
  assert.match(r4.msg ?? '', /هنوز قطع است/);

  const r5 = step(r4.state, [], t0 + 70 * 60_000);
  assert.match(r5.msg ?? '', /دوباره بالا آمد/);
  assert.deepEqual(r5.state, { fails: 0, downSince: null, alertedAt: null });

  const r6 = step(r5.state, [], t0 + 75 * 60_000);
  assert.equal(r6.msg, null);
});
