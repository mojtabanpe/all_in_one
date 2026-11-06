import { firstValueFrom, of, throwError } from 'rxjs';
import { GrowthActivityInterceptor } from './growth-activity.interceptor';

describe('Successful activity observer', () => {
  const visitor = '019a59e3-4070-7000-8000-000000000001';
  function setup(
    path = '/api/planner/tasks',
    user: unknown = { id: 'user' },
    cookie = `aio_growth_visitor=${visitor}`,
  ) {
    const recordMilestone = vi.fn().mockResolvedValue(undefined);
    const interceptor = new GrowthActivityInterceptor(
      { recordMilestone } as never,
      { get: () => 'true' } as never,
    );
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: path,
          user,
          headers: { cookie, 'accept-language': 'en' },
        }),
      }),
    } as never;
    return {
      recordMilestone,
      run: (handler = { handle: () => of({ id: 'created' }) }) =>
        firstValueFrom(interceptor.intercept(context, handler)),
    };
  }
  it('records a successful authenticated task creation without its content', async () => {
    const { run, recordMilestone } = setup();
    expect(await run()).toEqual({ id: 'created' });
    expect(recordMilestone).toHaveBeenCalledWith(
      visitor,
      'first_task_created',
      'en',
    );
  });
  it('records accepted reviews but not failed actions', async () => {
    const good = setup('/api/english/cards/card-id/review');
    await good.run();
    expect(good.recordMilestone).toHaveBeenCalledWith(
      visitor,
      'first_review_completed',
      'en',
    );
    const failed = setup();
    await expect(
      failed.run({
        handle: () => throwError(() => new Error('action failed')),
      }),
    ).rejects.toThrow('action failed');
    expect(failed.recordMilestone).not.toHaveBeenCalled();
  });
  it('ignores unrelated routes, unauthenticated requests, invalid IDs and old opt-outs', async () => {
    for (const fixture of [
      setup('/api/planner/tasks/batch'),
      setup('/api/planner/tasks', null),
      setup('/api/planner/tasks', { id: 'user' }, 'aio_growth_visitor=bad'),
      setup(
        '/api/planner/tasks',
        { id: 'user' },
        `aio_growth_visitor=${visitor}; aio_growth_preference=denied`,
      ),
    ]) {
      await fixture.run();
      expect(fixture.recordMilestone).not.toHaveBeenCalled();
    }
  });
  it('does not fail the successful action if analytics is unavailable', async () => {
    const { run, recordMilestone } = setup();
    recordMilestone.mockRejectedValue(new Error('database unavailable'));
    expect(await run()).toEqual({ id: 'created' });
  });
});
