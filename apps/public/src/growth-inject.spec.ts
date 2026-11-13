import {
  injectCampaign,
  isVisitorId,
  loginHref,
  visitorCookie,
} from './growth-inject';

const PAID = {
  utm_source: 'telegram',
  utm_medium: 'partner',
  utm_campaign: 'tg_partner_linuxor',
  utm_content: 'linuxor',
};
const search = (query: string) => new URLSearchParams(query);

/** The prerendered home page, trimmed to the parts that carry the customer links. */
const PAGE = `<!doctype html><html><body>
<a aioBtn href="/app/login?mode=register">start</a>
<a href="/app/login">sign in</a>
</body></html>`;

describe('injectCampaign', () => {
  it('tags every customer link with the campaign of the request', () => {
    const { html, campaign } = injectCampaign(
      PAGE,
      search('utm_source=telegram&utm_medium=partner'),
    );
    expect(campaign).toEqual({ utm_source: 'telegram', utm_medium: 'partner' });
    expect(html).toContain(
      'href="/app/login?mode=register&amp;utm_source=telegram&amp;utm_medium=partner"',
    );
    expect(html).toContain(
      'href="/app/login?utm_source=telegram&amp;utm_medium=partner"',
    );
  });

  it('leaves the page byte-identical when the request has no campaign', () => {
    for (const query of ['', '?ref=newsletter&token=secret', '?utm_source=']) {
      const result = injectCampaign(PAGE, search(query));
      expect(result.campaign).toEqual({});
      expect(result.html).toBe(PAGE);
    }
  });

  it('drops parameters outside the allow-list', () => {
    const { html } = injectCampaign(
      PAGE,
      search('utm_source=telegram&token=abc&redirect=https://evil.example'),
    );
    expect(html).not.toContain('token');
    expect(html).not.toContain('evil.example');
  });

  it('keeps a parameter the page already set', () => {
    expect(loginHref('/app/login?mode=register', { utm_source: 'x' })).toBe(
      'href="/app/login?mode=register&amp;utm_source=x"',
    );
    expect(loginHref('/app/login?utm_source=old', { utm_source: 'new' })).toBe(
      'href="/app/login?utm_source=old"',
    );
  });

  it('escapes a campaign value into a safe href', () => {
    const { html } = injectCampaign(
      PAGE,
      search('utm_content=a%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'),
    );
    // URLSearchParams percent-encodes the payload, so no quote can break out of the attribute.
    expect(html).not.toContain('<script>');
    expect(html).toContain('utm_content=a%22%3E%3Cscript%3E');
    expect(html.match(/href="/g)).toHaveLength(2);
  });

  it('touches nothing but the customer links', () => {
    const { html } = injectCampaign(
      PAGE,
      search('utm_campaign=tg_partner_linuxor'),
    );
    expect(html.replace(/href="[^"]*"/g, '')).toBe(
      PAGE.replace(/href="[^"]*"/g, ''),
    );
  });
});

describe('visitorCookie', () => {
  it('writes the same cookie shape the client writes', () => {
    const id = '0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a';
    expect(visitorCookie(id, true)).toBe(
      `aio_growth_visitor=${id}; Path=/; Max-Age=7776000; SameSite=Lax; Secure`,
    );
    expect(visitorCookie(id, false)).not.toContain('Secure');
  });

  it('only accepts a visitor id the client would keep', () => {
    expect(isVisitorId('0199f1f0-6a8e-7c3b-9a52-3f0c2b1e4d5a')).toBe(true);
    expect(isVisitorId('not-a-uuid')).toBe(false);
    expect(isVisitorId(undefined)).toBe(false);
  });
});

describe('focused signup handoff before hydration', () => {
  it('preserves encoded goal and destination while adding campaign tags', () => {
    const { html } = injectCampaign(
      '<a href="/app/login?mode=register&amp;goal=english&amp;redirect=%2Fenglish">Start</a>',
      new URLSearchParams(
        'utm_source=instagram&utm_campaign=english_7day_pilot',
      ),
    );
    const href = /href="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, '&');
    const url = new URL(href ?? '', 'https://poshtetgarm.ir');
    expect(url.searchParams.get('goal')).toBe('english');
    expect(url.searchParams.get('redirect')).toBe('/english');
    expect(url.searchParams.get('utm_source')).toBe('instagram');
    expect([...url.searchParams.keys()]).not.toContain('amp;goal');
  });
});
