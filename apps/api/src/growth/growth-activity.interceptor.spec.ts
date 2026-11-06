import { firstValueFrom, of, throwError } from 'rxjs';
import { GrowthActivityInterceptor } from './growth-activity.interceptor';

describe('Successful activity observer', () => {
  const visitor = '019a59e3-4070-7000-8000-000000000001';
  function setup(
    path = '/api/planner/tasks',
    user: unknown = { id: 'user' },
    cookie = `aio_growth_visitor=${visitor}`,
  ) {
    const recordActivity = vi.fn().mockResolvedValue(undefined);
    const interceptor = new GrowthActivityInterceptor(
      { recordActivity } as never,
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
      recordActivity,
      run: (handler = { handle: () => of({ id: 'created' }) }) =>
        firstValueFrom(interceptor.intercept(context, handler)),
    };
  }
  it('records a successful authenticated task creation without its content', async () => {
    const { run, recordActivity } = setup();
    expect(await run()).toEqual({ id: 'created' });
    expect(recordActivity).toHaveBeenCalledWith(
      visitor,
      'en',
      'first_task_created',
    );
  });
  it('records accepted reviews but not failed actions', async () => {
    const good = setup('/api/english/cards/card-id/review');
    await good.run();
    expect(good.recordActivity).toHaveBeenCalledWith(
      visitor,
      'en',
      'first_review_completed',
    );
    const failed = setup();
    await expect(
      failed.run({
        handle: () => throwError(() => new Error('action failed')),
      }),
    ).rejects.toThrow('action failed');
    expect(failed.recordActivity).not.toHaveBeenCalled();
  });
  it('records a daily marker for successful health logs without their content', async () => {
    for (const path of ['/api/health/meals', '/api/health/workouts']) {
      const fixture = setup(path);
      await fixture.run();
      expect(fixture.recordActivity).toHaveBeenCalledWith(
        visitor,
        'en',
        undefined,
      );
    }
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
      expect(fixture.recordActivity).not.toHaveBeenCalled();
    }
  });
  it('does not fail the successful action if analytics is unavailable', async () => {
    const { run, recordActivity } = setup();
    recordActivity.mockRejectedValue(new Error('database unavailable'));
    expect(await run()).toEqual({ id: 'created' });
  });
});
