import { GrowthRetention } from './growth-retention';

describe('Growth retention', () => {
  it('does not start cleanup until the rollout is enabled', () => {
    const retention = new GrowthRetention(
      {} as never,
      { get: () => 'false' } as never,
    );
    const prune = vi.spyOn(retention, 'prune');
    retention.onModuleInit();
    expect(prune).not.toHaveBeenCalled();
    retention.onModuleDestroy();
  });

  it('starts cleanup on boot and retries hourly, then stops on shutdown', async () => {
    vi.useFakeTimers();
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const retention = new GrowthRetention(
      { growthEvent: { deleteMany } } as never,
      { get: () => 'true' } as never,
    );
    try {
      retention.onModuleInit();
      expect(deleteMany).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(deleteMany).toHaveBeenCalledTimes(2);
      const cutoff = deleteMany.mock.calls[1][0].where.createdAt.lt;
      expect(cutoff.getTime()).toBe(Date.now() - 90 * 86_400_000);
      retention.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(deleteMany).toHaveBeenCalledTimes(2);
    } finally {
      retention.onModuleDestroy();
      vi.useRealTimers();
    }
  });
});
