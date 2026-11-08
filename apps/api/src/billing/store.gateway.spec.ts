import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreGateway } from './store.gateway';

describe('Store billing transport', () => {
  const purchased = {
    kind: 'androidpublisher#productPurchase',
    purchaseState: 0,
    consumptionState: 1,
    developerPayload: 'user-1',
    purchaseTime: 1_762_600_000_000,
  };
  afterEach(() => vi.unstubAllGlobals());
  function replies(...answers: { status: number; body?: unknown }[]) {
    const fetchMock = vi.fn();
    for (const { status, body } of answers)
      fetchMock.mockResolvedValueOnce({
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
      });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const gateway = (config: Record<string, string>) =>
    new StoreGateway(new ConfigService(config));

  it('checks a Bazaar token for the package and SKU with the Pishkhan key, never sending it elsewhere', async () => {
    const fetchMock = replies({ status: 200, body: purchased });
    const result = await gateway({ BAZAAR_API_SECRET: 'test-only-key' }).verify(
      'bazaar',
      'monthly',
      'tok/en+1',
    );
    expect(result).toEqual({
      kind: 'purchased',
      payload: 'user-1',
      purchaseTime: 1_762_600_000_000,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://pardakht.cafebazaar.ir/devapi/v2/api/validate/ir.poshtetgarm.poshtetgarm_hybrid/inapp/monthly/purchases/tok%2Fen%2B1/',
    );
    expect(init.headers['CAFEBAZAAR-PISHKHAN-API-SECRET']).toBe(
      'test-only-key',
    );
    expect(init.redirect).toBe('error');
  });

  it('refreshes the Bazaar OAuth token, reuses it and refreshes again when it is refused', async () => {
    const fetchMock = replies(
      { status: 200, body: { access_token: 'access-1', expires_in: 3600 } },
      { status: 200, body: purchased },
      { status: 401 },
      { status: 200, body: { access_token: 'access-2', expires_in: 3600 } },
      { status: 200, body: purchased },
    );
    const store = gateway({
      BAZAAR_CLIENT_ID: 'client',
      BAZAAR_CLIENT_SECRET: 'test-only-secret',
      BAZAAR_REFRESH_TOKEN: 'refresh',
    });
    await store.verify('bazaar', 'monthly', 'token-123');
    await store.verify('bazaar', 'monthly', 'token-456');
    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe(
      'https://pardakht.cafebazaar.ir/devapi/v2/auth/token/',
    );
    expect(String(calls[0][1].body)).toBe(
      'grant_type=refresh_token&client_id=client&client_secret=test-only-secret&refresh_token=refresh',
    );
    expect(calls[1][1].headers.Authorization).toBe('Bearer access-1');
    expect(calls[2][1].headers.Authorization).toBe('Bearer access-1');
    expect(calls[4][1].headers.Authorization).toBe('Bearer access-2');
  });

  it('posts a Myket token to the verify API with the access token header', async () => {
    const fetchMock = replies({ status: 200, body: purchased });
    await gateway({
      MYKET_ACCESS_TOKEN: 'test-only-token',
      BILLING_ANDROID_PACKAGE: 'ir.example.app',
    }).verify('myket', 'yearly', 'token-789');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://developer.myket.ir/api/partners/applications/ir.example.app/purchases/products/yearly/verify',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['X-Access-Token']).toBe('test-only-token');
    expect(JSON.parse(init.body)).toEqual({ tokenId: 'token-789' });
  });

  it('treats unknown, refunded and failed purchases as invalid', async () => {
    replies(
      { status: 404, body: { error: 'not_found' } },
      { status: 400, body: {} },
      { status: 200, body: { ...purchased, purchaseState: 1 } },
    );
    const store = gateway({
      BAZAAR_API_SECRET: 'k',
      MYKET_ACCESS_TOKEN: 'k',
    });
    expect(await store.verify('bazaar', 'monthly', 'token-404')).toEqual({
      kind: 'invalid',
    });
    expect(await store.verify('myket', 'monthly', 'token-400')).toEqual({
      kind: 'invalid',
    });
    expect(await store.verify('bazaar', 'monthly', 'refunded')).toEqual({
      kind: 'invalid',
    });
  });

  it('reports outages, refused keys, odd bodies and missing credentials as unavailable without the secret', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new Error('test-only-key timeout'))
      .mockResolvedValueOnce({ status: 503, ok: false })
      .mockResolvedValueOnce({ status: 403, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => '<html>',
      });
    vi.stubGlobal('fetch', fetchMock);
    const store = gateway({ BAZAAR_API_SECRET: 'test-only-key' });
    for (let i = 0; i < 4; i++) {
      const error = await store
        .verify('bazaar', 'monthly', 'token-123')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(String((error as Error).message)).not.toContain('test-only-key');
    }
    await expect(
      gateway({}).verify('myket', 'monthly', 'token-123'),
    ).rejects.toThrow('not configured');
    await expect(
      gateway({}).verify('bazaar', 'monthly', 'token-123'),
    ).rejects.toThrow('not configured');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
