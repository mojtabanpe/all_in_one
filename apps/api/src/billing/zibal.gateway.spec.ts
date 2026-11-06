import { ConfigService } from '@nestjs/config';
import { ZibalGateway } from './zibal.gateway';

describe('Zibal gateway transport', () => {
  const config = {
    ZIBAL_MERCHANT: 'test-only-secret',
    ZIBAL_SANDBOX: 'false',
    ZIBAL_CALLBACK_URL: 'https://poshtetgarm.ir/api/payments/callback',
  };
  const gateway = () => new ZibalGateway(new ConfigService(config));
  afterEach(() => vi.unstubAllGlobals());
  function reply(data: unknown) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sends server-owned Rial amount/order and never returns the merchant', async () => {
    const fetchMock = reply({ result: 100, trackId: 123 });
    const result = await gateway().request('order-1', 500000);
    expect(result).toEqual({
      trackId: '123',
      paymentUrl: 'https://gateway.zibal.ir/start/123',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      merchant: 'test-only-secret',
      amount: 500000,
      orderId: 'order-1',
      callbackUrl: config.ZIBAL_CALLBACK_URL,
      description: 'Poshtetgarm order-1',
    });
  });

  it('does not silently fall back to sandbox for missing live credentials', async () => {
    const fetchMock = reply({});
    await expect(
      new ZibalGateway(
        new ConfigService({ ZIBAL_MERCHANT: '', ZIBAL_SANDBOX: 'false' }),
      ).verify('123', 500000, 'order-1'),
    ).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid amounts before any network request', async () => {
    const fetchMock = reply({});
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(gateway().request('order-1', amount)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires matched amount, paid status and a matching order if returned', async () => {
    for (const data of [
      { result: 100, status: 1, amount: 1 },
      { result: 100, status: 0, amount: 500000 },
      { result: 202, status: 1, amount: 500000 },
      { result: 100, status: 1, amount: 500000, orderId: 'another-order' },
    ]) {
      reply(data);
      await expect(gateway().verify('123', 500000, 'order-1')).rejects.toThrow(
        'could not be verified',
      );
    }
  });

  it('distinguishes first verification from an already verified payment', async () => {
    reply({
      result: 100,
      status: 1,
      amount: 500000,
      orderId: 'order-1',
      refNumber: 'ref-1',
    });
    expect(await gateway().verify('123', 500000, 'order-1')).toEqual({
      kind: 'verified',
      refNumber: 'ref-1',
    });
    reply({ result: 201, status: 1, amount: 500000 });
    expect(await gateway().verify('123', 500000, 'order-1')).toEqual({
      kind: 'already_verified',
      refNumber: null,
    });
  });

  it('does not expose upstream errors containing credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(config.ZIBAL_MERCHANT)),
    );
    await expect(gateway().verify('123', 500000, 'order-1')).rejects.toThrow(
      'Payment gateway is unavailable',
    );
  });
});
