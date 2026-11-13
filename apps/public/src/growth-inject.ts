import {
  extractGrowthCampaign,
  type GrowthCampaign,
} from '@all-in-one/shared/schemas';

/** The visitor identity cookie the browser client also writes (growth-analytics.ts). */
export const VISITOR_COOKIE = 'aio_growth_visitor';
export const VISITOR_MAX_AGE = 90 * 86_400;

/** The prerendered pages link to the customer app's sign-in page with no campaign in the href. */
const LOGIN_LINK = /href="(?<href>\/app\/login(?:\?[^"]*)?)"/g;

/** A UUID the client's `context()` accepts; anything else would be replaced there. */
export const isVisitorId = (value: string | undefined): boolean =>
  !!value && /^[0-9a-f-]{36}$/i.test(value);

/**
 * One `/app/login…` href plus the campaign of the current request. Existing parameters win over the
 * campaign (the page's own `mode=register` must survive), and `&` is escaped so the HTML stays valid.
 */
export function loginHref(href: string, campaign: GrowthCampaign): string {
  const url = new URL(href.replace(/&amp;/g, '&'), 'http://page.invalid');
  for (const [key, value] of Object.entries(campaign))
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  return `href="${url.pathname}${url.search.replace(/&/g, '&amp;')}"`;
}

/**
 * A prerendered page is shared by every visitor, so a paid link's campaign is lost unless the server
 * puts it into the served HTML: the client only adds it after hydration, which a fast tap skips.
 * Unknown parameters are dropped by the shared allow-list; with no campaign the page is untouched.
 */
export function injectCampaign(
  html: string,
  search: { get(key: string): string | null },
): { html: string; campaign: GrowthCampaign } {
  const campaign = extractGrowthCampaign(search);
  if (Object.keys(campaign).length === 0) return { html, campaign };
  return {
    html: html.replace(LOGIN_LINK, (_match, href: string) =>
      loginHref(href, campaign),
    ),
    campaign,
  };
}

/** `Set-Cookie` for a visitor that arrived with a campaign and has no identity yet. */
export function visitorCookie(visitorId: string, secure: boolean): string {
  return `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${VISITOR_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}
