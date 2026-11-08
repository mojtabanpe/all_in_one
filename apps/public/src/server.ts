import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  injectCampaign,
  isVisitorId,
  VISITOR_COOKIE,
  visitorCookie,
} from './growth-inject';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/**', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * A paid link's campaign (`?utm_…`) has to reach the served HTML: the prerendered page is shared by
 * every visitor and the client only tags its links after hydration, which a fast tap on a phone
 * skips. So for a request that carries a campaign, the page is read from disk, its customer links
 * are tagged, and a visitor cookie is set — the same identity the client would create anyway.
 * Requests without a campaign fall through untouched (static file or the Angular engine).
 */
const pageFor = (requestPath: string): string | null => {
  // `resolve` would restart at the filesystem root for a leading slash, so strip both ends.
  const clean = requestPath.replace(/^\/+|\/+$/g, '');
  if (clean.includes('..')) return null;
  return clean === ''
    ? resolve(browserDistFolder, 'index.html')
    : resolve(browserDistFolder, clean, 'index.html');
};

/** The requested page, from the untouched URL: a mounted wildcard rewrites `req.path`. */
const pagePath = (originalUrl: string): string => {
  const path = originalUrl.split('?')[0] ?? '/';
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const cookieValue = (
  header: string | undefined,
  name: string,
): string | undefined =>
  header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

app.use(async (req, res, next) => {
  if (req.method !== 'GET' || !req.accepts('html')) return next();
  const query = new URLSearchParams(req.originalUrl.split('?')[1] ?? '');
  if (![...query.keys()].some((key) => key.startsWith('utm_'))) return next();
  const file = pageFor(pagePath(req.originalUrl));
  if (!file) return next();
  let page: string;
  try {
    page = await readFile(file, 'utf8');
  } catch {
    return next(); // not a prerendered page: let the engine answer as usual
  }
  const { html, campaign } = injectCampaign(page, query);
  if (Object.keys(campaign).length === 0) return next();
  if (!isVisitorId(cookieValue(req.headers.cookie, VISITOR_COOKIE))) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', visitorCookie(randomUUID(), secure));
  }
  // Never let a proxy cache one visitor's tagged copy.
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] || 4000);
  // HOST=127.0.0.1 in production: only the reverse proxy reaches it.
  const host = process.env['HOST'] || '0.0.0.0';
  const server = app.listen(port, host, async (error?: Error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
    // Set when Nx waits for this server to be ready
    if (process.env['NX_READY_SIGNAL_SOCKET']) {
      try {
        // Function keeps TypeScript and bundlers from rewriting or bundling the import
        const load = new Function('s', 'return import(s)') as (
          s: string,
        ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
        (await load('@nx/js/ready-signal')).emitReadySignal(server);
      } catch {
        // @nx/js isn't installed
      }
    }
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
