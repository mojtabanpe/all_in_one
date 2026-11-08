import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { API_BASE_URL } from '@all-in-one/web/shared';
import {
  StoreBilling,
  StorePurchaseCanceled,
  storeFromUserAgent,
} from './store-billing';

describe('StoreBilling', () => {
  const agent = 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile';
  let request: ReturnType<
    typeof vi.fn<
      (method: string, args?: Record<string, unknown>) => Promise<unknown>
    >
  >;

  function setup(userAgent: string) {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    request = vi.fn();
    window.PoshtetgarmStore = { request };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    return {
      billing: TestBed.inject(StoreBilling),
      http: TestBed.inject(HttpTestingController),
    };
  }
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.PoshtetgarmStore;
  });
  /** Lets the awaited bridge and HTTP steps run until the next request is pending. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('recognizes only the store builds from the user agent', () => {
    expect(storeFromUserAgent(`${agent} PoshtetgarmStore/bazaar`)).toBe(
      'bazaar',
    );
    expect(storeFromUserAgent(`${agent} PoshtetgarmStore/myket`)).toBe('myket');
    expect(storeFromUserAgent(agent)).toBeNull();
    expect(storeFromUserAgent(`${agent} PoshtetgarmStore/zibal`)).toBeNull();
    expect(setup(agent).billing.store).toBeNull();
  });

  it('asks the server first, buys the SKU with the payload, has it verified and only then consumes it', async () => {
    const { billing, http } = setup(`${agent} PoshtetgarmStore/bazaar`);
    request.mockImplementation(async (method: string) =>
      method === 'purchase'
        ? { sku: 'three_months', purchaseToken: 'token-123' }
        : undefined,
    );
    const done = billing.buy('three-months');
    const intent = http.expectOne('/api/billing/store/intent');
    expect(intent.request.body).toEqual({
      store: 'bazaar',
      plan: 'three-months',
    });
    intent.flush({ sku: 'three_months', payload: 'user-1' });
    await settle();
    expect(request).toHaveBeenCalledWith('purchase', {
      sku: 'three_months',
      payload: 'user-1',
    });
    const verify = http.expectOne('/api/billing/store/verify');
    expect(verify.request.body).toEqual({
      store: 'bazaar',
      sku: 'three_months',
      purchaseToken: 'token-123',
    });
    expect(request).not.toHaveBeenCalledWith('consume', expect.anything());
    verify.flush({ status: 'paid' });
    expect(await done).toBe('paid');
    expect(request).toHaveBeenLastCalledWith('consume', {
      purchaseToken: 'token-123',
    });
  });

  it('reports a closed purchase sheet and never consumes a purchase the server refused', async () => {
    const { billing, http } = setup(`${agent} PoshtetgarmStore/myket`);
    request.mockResolvedValueOnce(null);
    const canceled = billing.buy('monthly');
    http
      .expectOne('/api/billing/store/intent')
      .flush({ sku: 'monthly', payload: 'user-1' });
    await expect(canceled).rejects.toBeInstanceOf(StorePurchaseCanceled);

    request.mockImplementation(async (method: string) =>
      method === 'purchases'
        ? [
            { sku: 'monthly', purchaseToken: 'other-account' },
            { sku: 'monthly', purchaseToken: 'mine' },
          ]
        : undefined,
    );
    const restored = billing.restore();
    await settle();
    http
      .expectOne('/api/billing/store/verify')
      .flush(
        { message: 'This purchase was already used' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    http.expectOne('/api/billing/store/verify').flush({ status: 'paid' });
    expect(await restored).toBe(1);
    expect(
      request.mock.calls.filter(([method]) => method === 'consume'),
    ).toEqual([['consume', { purchaseToken: 'mine' }]]);
  });

  it('turns shell error codes into readable messages', async () => {
    const { billing } = setup(`${agent} PoshtetgarmStore/bazaar`);
    request.mockRejectedValue(new Error('unavailable'));
    await expect(billing.restore()).rejects.toThrow('فروشگاه در دسترس نیست');
    expect(await billing.products(['monthly'])).toBeNull();
  });
});
