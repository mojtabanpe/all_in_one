import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { MCP_SCOPE_LABELS, type McpScope } from '@all-in-one/shared/schemas';

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );

/** A small self-contained Persian page with a strict CSP (no app bundle needed). */
function page(res: Response, title: string, body: string, formTarget = '') {
  const nonce = randomBytes(18).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self' ${formTarget}; base-uri 'none'; frame-ancestors 'none'`,
  );
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res
    .type('html')
    .send(
      `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}، همه در یک</title><style nonce="${nonce}">body{font:1rem/1.8 Vazirmatn,Tahoma,system-ui,sans-serif;background:#f3f6f8;color:#1d2433;margin:0;padding:1.25rem}main{max-width:32rem;margin:2.5rem auto;background:#fff;border-radius:22px;padding:1.5rem;box-shadow:0 10px 30px rgba(30,40,60,.08)}h1{font-size:1.4rem;line-height:1.4;margin:0 0 1rem}a{color:#1a5fb4}label{display:block;margin-top:1rem;font-weight:600}input{font:inherit;box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #b9c2cf;border-radius:14px;direction:ltr}button{font:inherit;cursor:pointer;margin:1rem 0 .5rem;width:100%;min-height:48px;border:0;border-radius:999px;background:#262d3d;color:#fff}ul{padding-inline-start:1.2rem}li{margin:.4rem 0}.muted{color:#5b6475;font-size:.9rem}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`,
    );
}

export function consentPage(
  res: Response,
  opts: {
    request: string;
    client: string;
    scopes: string[];
    redirectUri: string;
    accountUrl: string;
  },
) {
  const scopes = opts.scopes
    .map((s) => `<li>${escapeHtml(MCP_SCOPE_LABELS[s as McpScope] ?? s)}</li>`)
    .join('');
  page(
    res,
    'اتصال به همه در یک',
    `<p><strong dir="auto">${escapeHtml(opts.client)}</strong> این دسترسی‌ها را می‌خواهد:</p><ul>${scopes}</ul><p class="muted">کلید شخصی را از <a href="${escapeHtml(opts.accountUrl)}" target="_blank" rel="noopener">صفحه حساب، بخش اتصال به ChatGPT</a> بساز و اینجا بگذار. با تأیید، این اتصال برای حساب صاحب کلید کار می‌کند.</p><form method="post" action="/api/mcp/consent"><input type="hidden" name="request" value="${escapeHtml(opts.request)}"><label for="token">کلید شخصی</label><input id="token" name="token" type="password" autocomplete="off" required maxlength="100" spellcheck="false"><button type="submit">تأیید اتصال</button></form>`,
    new URL(opts.redirectUri).origin,
  );
}

export function errorPage(res: Response, message: string) {
  page(
    res.status(400),
    'اتصال انجام نشد',
    `<p role="alert">${escapeHtml(message)}</p><p class="muted">به ChatGPT برگرد و اتصال را دوباره شروع کن.</p>`,
  );
}
