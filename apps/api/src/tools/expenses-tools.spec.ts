import { expensesTools } from './expenses-tools';
import type { ToolSink } from './tool-kit';

describe('expense category tools (MCP and assistant)', () => {
  function setup() {
    const tools = new Map<
      string,
      { scope: string; handler: (args: never) => Promise<unknown> }
    >();
    const sink: ToolSink = {
      user: 'u1',
      tool: (name, spec, handler) => {
        tools.set(name, { scope: spec.scope, handler: handler as never });
      },
    };
    const expenses = {
      createCategory: vi.fn(async () => ({ id: 'c1' })),
      updateCategory: vi.fn(async () => ({ id: 'c1' })),
      deleteCategory: vi.fn(async () => undefined),
    };
    expensesTools(sink, { expenses: expenses as never });
    return { tools, expenses };
  }

  it('offers create, update and delete for categories with the write scope', () => {
    const { tools } = setup();
    for (const name of [
      'create_expense_category',
      'update_expense_category',
      'delete_expense_category',
    ])
      expect(tools.get(name)?.scope).toBe('expenses:write');
  });

  it('edits a category for the calling user, budget removal included', async () => {
    const { tools, expenses } = setup();
    await tools.get('update_expense_category')!.handler({
      id: 'c1',
      name: 'Food',
      monthly_budget: null,
    } as never);
    expect(expenses.updateCategory).toHaveBeenCalledWith('u1', 'c1', {
      name: 'Food',
      color: undefined,
      icon: undefined,
      keywords: undefined,
      monthlyBudget: null,
    });
  });

  it('deletes a category for the calling user', async () => {
    const { tools, expenses } = setup();
    await tools.get('delete_expense_category')!.handler({ id: 'c1' } as never);
    expect(expenses.deleteCategory).toHaveBeenCalledWith('u1', 'c1');
  });
});
