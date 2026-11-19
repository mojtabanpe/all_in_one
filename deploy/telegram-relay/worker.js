/**
 * Telegram relay for Poshtetgarm (directive 168). The api server in Iran cannot reach api.telegram.org, so it
 * sends Bot API calls here; this Worker forwards them unchanged and stores nothing (no token, no messages).
 *
 *   POST /bot<token>/<method>   from the api server, with header `x-relay-key: <RELAY_KEY>` → api.telegram.org
 *                               (JSON calls and multipart uploads such as sendVoice)
 *   GET  /file/bot<token>/<path> same key; downloads a file the user sent (voice messages for shadowing)
 *   POST /webhook               from Telegram (only if Telegram cannot reach poshtetgarm.ir directly)
 *                               → WEBHOOK_TARGET, with Telegram's secret-token header passed through
 *
 * Secrets / vars (wrangler): RELAY_KEY (secret), WEBHOOK_TARGET (e.g. https://poshtetgarm.ir/api/telegram/webhook).
 */
const API = 'https://api.telegram.org';
const BOT_PATH = /^\/bot\d+:[A-Za-z0-9_-]{30,}\/[A-Za-z]{3,40}$/;
const FILE_PATH =
  /^\/file\/bot\d+:[A-Za-z0-9_-]{30,}\/[A-Za-z0-9_.\/-]{1,200}$/;
const MAX_BODY = 5_000_000;

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (
        !FILE_PATH.test(url.pathname) ||
        url.pathname.includes('..') ||
        !equal(request.headers.get('x-relay-key'), env.RELAY_KEY)
      )
        return new Response('Not found', { status: 404 });
      const file = await fetch(API + url.pathname);
      return new Response(file.body, {
        status: file.status,
        headers: {
          'content-type':
            file.headers.get('content-type') ?? 'application/octet-stream',
        },
      });
    }
    if (request.method !== 'POST')
      return new Response('Not found', { status: 404 });
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY)
      return new Response('Too large', { status: 413 });

    if (url.pathname === '/webhook') {
      if (!env.WEBHOOK_TARGET)
        return new Response('Not found', { status: 404 });
      const secret =
        request.headers.get('x-telegram-bot-api-secret-token') ?? '';
      const response = await fetch(env.WEBHOOK_TARGET, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': secret,
        },
        body,
      });
      return new Response(null, { status: response.status });
    }

    if (
      !BOT_PATH.test(url.pathname) ||
      !equal(request.headers.get('x-relay-key'), env.RELAY_KEY)
    )
      return new Response('Not found', { status: 404 });
    const response = await fetch(API + url.pathname, {
      method: 'POST',
      // JSON calls and multipart uploads (the boundary is part of the content type).
      headers: {
        'content-type':
          request.headers.get('content-type') ?? 'application/json',
      },
      body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  },
};
