/**
 * Public front for the ChatGPT / Claude connection (MCP + OAuth). Since November 2026 OpenAI's and Anthropic's
 * servers cannot reach poshtetgarm.ir (it sits on an Iranian network), while Cloudflare can. This Worker forwards
 * only the MCP and OAuth paths to the origin, unchanged (streaming responses included), and stores nothing.
 * The api's MCP_PUBLIC_URL is this Worker's address, so the OAuth metadata and the server url point here.
 */
const ORIGIN = 'https://poshtetgarm.ir';
const PATHS = new Set([
  '/api/mcp',
  '/api/mcp/',
  '/api/mcp/consent',
  '/authorize',
  '/token',
  '/register',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/api/mcp',
]);
// Hop-by-hop or Cloudflare-added request headers that must not reach the origin as if the client sent them.
const DROP = [
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-proto',
  'x-real-ip',
];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!PATHS.has(url.pathname))
      return new Response('Not found', { status: 404 });
    const headers = new Headers(request.headers);
    for (const name of DROP) headers.delete(name);
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : request.body;
    return fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });
  },
};
