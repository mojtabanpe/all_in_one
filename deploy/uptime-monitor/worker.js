/**
 * Outside uptime monitor for Poshtetgarm (directive 192). GlitchTip and the api's own alerts live on the server,
 * so they go quiet when the server itself is down. This Worker runs on Cloudflare every 5 minutes, checks the api,
 * the public site and the customer app, and tells the dev/ops Telegram bot (the same bot as directive 186):
 *
 *   - "down" after 2 failed rounds in a row (about 10 minutes), so one slow request never wakes anyone;
 *   - a reminder every hour while it stays down;
 *   - "back up" once every check passes again, with how long it was down.
 *
 * Each check is retried once inside a round. Only the state (down since, failed rounds, last alert) is stored, in KV.
 *
 * Secrets (wrangler secret put): BOT_TOKEN (dev bot), CHAT_ID (comma-separated chat ids).
 * Vars: SITE (https://poshtetgarm.ir). KV binding: STATE.
 */
const CHECKS = [
  { name: 'api', path: '/api/health' },
  { name: 'سایت', path: '/' },
  { name: 'اپ', path: '/app/' },
];
const TIMEOUT_MS = 10_000;
const FAILS_BEFORE_ALERT = 2;
const REMIND_MS = 60 * 60_000;
const KEY = 'state';

async function probe(site, check) {
  const started = Date.now();
  try {
    const res = await fetch(site + check.path, {
      headers: { 'user-agent': 'PoshtetgarmUptime/1' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: 0 },
    });
    await res.body?.cancel();
    if (res.status === 200) return null;
    return `${check.name}: HTTP ${res.status}`;
  } catch (e) {
    const ms = Date.now() - started;
    return `${check.name}: ${ms >= TIMEOUT_MS ? 'بدون پاسخ در ۱۰ ثانیه' : String(e?.message ?? e).slice(0, 80)}`;
  }
}

/** All failures of one round; each check gets one retry. */
export async function round(site, probeFn = probe) {
  const results = await Promise.all(
    CHECKS.map(async (c) => (await probeFn(site, c)) && probeFn(site, c)),
  );
  return results.filter(Boolean);
}

function minutes(ms) {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} دقیقه` : `${Math.floor(m / 60)} ساعت و ${m % 60} دقیقه`;
}

/** Pure state step: returns the new state and the message to send (or null). */
export function step(prev, failures, now) {
  const s = prev ?? { fails: 0, downSince: null, alertedAt: null };
  if (!failures.length) {
    const msg = s.alertedAt
      ? `✅ Poshtetgarm دوباره بالا آمد. مدت قطعی: حدود ${minutes(now - s.downSince)}.`
      : null;
    return { state: { fails: 0, downSince: null, alertedAt: null }, msg };
  }
  const next = {
    fails: s.fails + 1,
    downSince: s.downSince ?? now,
    alertedAt: s.alertedAt,
  };
  const detail = failures.join('\n');
  if (!s.alertedAt && next.fails >= FAILS_BEFORE_ALERT) {
    next.alertedAt = now;
    return {
      state: next,
      msg: `🔴 Poshtetgarm از بیرون در دسترس نیست (${next.fails} دور پشت سر هم):\n${detail}`,
    };
  }
  if (s.alertedAt && now - s.alertedAt >= REMIND_MS) {
    next.alertedAt = now;
    return {
      state: next,
      msg: `🔴 هنوز قطع است، از حدود ${minutes(now - next.downSince)} پیش:\n${detail}`,
    };
  }
  return { state: next, msg: null };
}

async function tell(env, text) {
  const ids = String(env.CHAT_ID ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  await Promise.all(
    ids.map((chat_id) =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      }).catch(() => undefined),
    ),
  );
}

export default {
  async scheduled(_event, env) {
    const failures = await round(env.SITE);
    const prev = await env.STATE.get(KEY, 'json');
    const { state, msg } = step(prev, failures, Date.now());
    await env.STATE.put(KEY, JSON.stringify(state));
    if (msg) await tell(env, msg);
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
