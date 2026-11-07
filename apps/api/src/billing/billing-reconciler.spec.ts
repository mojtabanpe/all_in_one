import { BillingReconciler } from './billing-reconciler';

describe('Billing reconciler', () => {
  it('sweeps every ten minutes, survives a failure and stops on shutdown', async () => {
    vi.useFakeTimers();
    const reconcile = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    // The expiry SMS sweep runs beside it; its failure must not stop either.
    const notifyExpiring = vi
      .fn()
      .mockRejectedValueOnce(new Error('sms down'))
      .mockResolvedValue(0);
    const reconciler = new BillingReconciler({
      reconcile,
      notifyExpiring,
    } as never);
    try {
      reconciler.onModuleInit();
      expect(reconcile).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600_000);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(reconcile).toHaveBeenCalledTimes(2);
      expect(notifyExpiring).toHaveBeenCalledTimes(2);
      reconciler.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(600_000);
      expect(reconcile).toHaveBeenCalledTimes(2);
    } finally {
      reconciler.onModuleDestroy();
      vi.useRealTimers();
    }
  });
});
