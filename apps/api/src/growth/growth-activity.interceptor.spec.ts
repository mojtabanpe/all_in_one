import { firstValueFrom, of, throwError } from 'rxjs';
import { ONBOARDING_COMPLETED_HEADER } from '@all-in-one/shared/schemas';
import { GrowthActivityInterceptor } from './growth-activity.interceptor';

describe('Successful activity observer', () => {
  const visitor = '019a59e3-4070-7000-8000-000000000001';
  function setup(
    path = '/api/planner/tasks',
    user: unknown = { id: 'user' },
    cookie = `aio_growth_visitor=${visitor}`,
    enabled = true,
  ) {
    const complete = vi.fn().mockResolvedValue(false);
    const setHeader = vi.fn();
    const recordActivity = vi.fn().mockResolvedValue(undefined);
    const interceptor = new GrowthActivityInterceptor(
      { recordActivity } as never,
      { get: () => (enabled ? 'true' : 'false') } as never,
      { complete } as never,
    );
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => ({ setHeader }),
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
      complete,
      setHeader,
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
    expect(failed.complete).not.toHaveBeenCalled();
  });
  it('records a health activation milestone without meal or workout content', async () => {
    for (const path of ['/api/health/meals', '/api/health/workouts']) {
      const fixture = setup(path);
      await fixture.run();
      expect(fixture.recordActivity).toHaveBeenCalledWith(
        visitor,
        'en',
        'first_health_logged',
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
  it('completes account onboarding independently of browser analytics and opt-outs', async () => {
    const fixture = setup(
      '/api/planner/tasks',
      { id: 'user' },
      'aio_growth_preference=denied',
    );
    fixture.complete.mockResolvedValueOnce(true);
    await fixture.run();
    expect(fixture.complete).toHaveBeenCalledWith('user', 'planner');
    expect(fixture.setHeader).toHaveBeenCalledWith(
      ONBOARDING_COMPLETED_HEADER,
      '1',
    );
    await fixture.run();
    expect(fixture.setHeader).toHaveBeenCalledTimes(1);
    expect(fixture.recordActivity).not.toHaveBeenCalled();
  });
  it('keeps onboarding operational when analytics is disabled', async () => {
    const fixture = setup('/api/health/meals', { id: 'user' }, '', false);
    await fixture.run();
    expect(fixture.complete).toHaveBeenCalledWith('user', 'health');
    expect(fixture.recordActivity).not.toHaveBeenCalled();
  });
  it('keeps the activity and metrics successful if onboarding persistence fails', async () => {
    const fixture = setup();
    fixture.complete.mockRejectedValue(new Error('unavailable'));
    expect(await fixture.run()).toEqual({ id: 'created' });
    expect(fixture.recordActivity).toHaveBeenCalled();
  });
  it('does not fail the successful action if analytics is unavailable', async () => {
    const { run, recordActivity } = setup();
    recordActivity.mockRejectedValue(new Error('database unavailable'));
    expect(await run()).toEqual({ id: 'created' });
  });
});
