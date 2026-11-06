import { observeFirstActions } from './onboarding-tools';
import type { ToolSink } from './tool-kit';

describe('Assistant and MCP first-action observer', () => {
  function setup(name: string, action: () => Promise<unknown>) {
    let run!: () => Promise<unknown>;
    const complete = vi.fn().mockResolvedValue(undefined);
    const sink: ToolSink = {
      user: 'actor',
      tool: (_name, _spec, handler) => {
        run = () => handler({} as never);
      },
    };
    observeFirstActions(sink, { complete } as never).tool(
      name,
      {
        description: 'test',
        scope: 'planner:write',
        kind: 'create',
        input: {},
      },
      action,
    );
    return { run, complete };
  }
  it.each([
    ['create_task', 'planner'],
    ['review_card', 'english'],
    ['log_meal', 'health'],
    ['log_workout', 'health'],
  ])('marks successful %s for its actual actor', async (name, goal) => {
    const fixture = setup(name, async () => ({ saved: true }));
    expect(await fixture.run()).toEqual({ saved: true });
    expect(fixture.complete).toHaveBeenCalledWith('actor', goal);
  });
  it('does not mark failed or unrelated actions', async () => {
    const failed = setup('create_task', async () => {
      throw new Error('not saved');
    });
    await expect(failed.run()).rejects.toThrow('not saved');
    expect(failed.complete).not.toHaveBeenCalled();
    const read = setup('query_tasks', async () => []);
    await read.run();
    expect(read.complete).not.toHaveBeenCalled();
  });
  it('does not fail a saved action if progress persistence fails', async () => {
    const fixture = setup('create_task', async () => ({ saved: true }));
    fixture.complete.mockRejectedValue(new Error('unavailable'));
    expect(await fixture.run()).toEqual({ saved: true });
  });
});
