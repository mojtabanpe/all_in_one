import { firstTouchCampaign } from './auth.service';

/**
 * A signup copies the visitor's first touch when its own URL lost the campaign (an installed PWA or
 * the native shell opens without a query string), so the campaign report still counts the account.
 */
describe('firstTouchCampaign', () => {
  it('takes the earliest tagged event', () => {
    expect(
      firstTouchCampaign([
        { campaign: null },
        { campaign: {} },
        { campaign: { utm_source: 'telegram', utm_campaign: 'tg_partner' } },
        { campaign: { utm_source: 'instagram' } },
      ]),
    ).toEqual({ utm_source: 'telegram', utm_campaign: 'tg_partner' });
  });

  it('returns nothing when the visitor was never tagged', () => {
    expect(firstTouchCampaign([])).toBeUndefined();
    expect(firstTouchCampaign([{ campaign: null }, { campaign: {} }])).toBe(
      undefined,
    );
  });

  it('ignores values that are not a campaign', () => {
    for (const campaign of [
      'telegram',
      7,
      [],
      { token: 'secret' },
      { utm_source: '' },
    ])
      expect(firstTouchCampaign([{ campaign }])).toBeUndefined();
  });

  it('drops keys outside the allow-list instead of copying them', () => {
    expect(
      firstTouchCampaign([
        {
          campaign: {
            utm_source: 'qa',
            utm_campaign: 'tg_partner',
            token: 'x',
          },
        },
      ]),
    ).toBeUndefined();
  });
});
