import * as z from 'zod';
import type { ExpensesService } from '@all-in-one/applets/expenses/api';
import {
  EXPENSE_CATEGORY_COLORS,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_REPORT_PRESETS,
  MAX_EXPENSE_AMOUNT,
} from '@all-in-one/applets/expenses/contracts';
import type { ToolSink } from './tool-kit';

export function expensesTools(
  sink: ToolSink,
  deps: { expenses: ExpensesService },
): void {
  sink.tool(
    'list_expense_categories',
    {
      description:
        'List all expense categories for this user, including their name, color, icon, keywords, and monthly budget in Toman.',
      scope: 'expenses:read',
      kind: 'read',
      input: {},
    },
    async () => deps.expenses.listCategories(sink.user),
  );

  sink.tool(
    'create_expense_category',
    {
      description:
        'Create a new expense category with optional color, icon, keywords, and monthly budget (in Toman).',
      scope: 'expenses:write',
      kind: 'create',
      input: {
        name: z.string().min(1).max(80),
        color: z.enum(EXPENSE_CATEGORY_COLORS).optional(),
        icon: z.enum(EXPENSE_CATEGORY_ICONS).optional(),
        keywords: z.string().max(500).optional(),
        monthly_budget: z
          .number()
          .int()
          .min(1)
          .max(MAX_EXPENSE_AMOUNT)
          .optional(),
      },
    },
    async (args) =>
      deps.expenses.createCategory(sink.user, {
        name: args.name,
        color: args.color,
        icon: args.icon,
        keywords: args.keywords,
        monthlyBudget: args.monthly_budget,
      }),
  );

  sink.tool(
    'update_expense_category',
    {
      description:
        'Edit an expense category: rename it or change its color, icon, keywords (used for automatic categorizing) or monthly budget in Toman. Pass monthly_budget: null to remove the budget.',
      scope: 'expenses:write',
      kind: 'update',
      input: {
        id: z.uuid(),
        name: z.string().min(1).max(80).optional(),
        color: z.enum(EXPENSE_CATEGORY_COLORS).optional(),
        icon: z.enum(EXPENSE_CATEGORY_ICONS).optional(),
        keywords: z.string().max(500).optional(),
        monthly_budget: z
          .number()
          .int()
          .min(1)
          .max(MAX_EXPENSE_AMOUNT)
          .nullable()
          .optional(),
      },
    },
    async (args) =>
      deps.expenses.updateCategory(sink.user, args.id, {
        name: args.name,
        color: args.color,
        icon: args.icon,
        keywords: args.keywords,
        monthlyBudget: args.monthly_budget,
      }),
  );

  sink.tool(
    'delete_expense_category',
    {
      description:
        'Delete an empty expense category by ID. A category that still has expenses cannot be deleted: move those expenses with update_expense first.',
      scope: 'expenses:write',
      kind: 'delete',
      input: {
        id: z.uuid(),
      },
    },
    async (args) => deps.expenses.deleteCategory(sink.user, args.id),
  );

  sink.tool(
    'classify_expense_category',
    {
      description:
        'Use the AI decision model to classify an expense into the best matching category without logging it.',
      scope: 'expenses:read',
      kind: 'read',
      input: {
        title: z.string().min(1).max(160),
        note: z.string().max(1000).optional(),
      },
    },
    async (args) =>
      deps.expenses.classify(sink.user, {
        title: args.title,
        note: args.note,
      }),
  );

  sink.tool(
    'list_expenses',
    {
      description:
        'Query expenses by preset range (today, last7day, last30day, last90day, this_month), date range (from/to in YYYY-MM-DD), category, or search text.',
      scope: 'expenses:read',
      kind: 'read',
      input: {
        preset: z.enum(EXPENSE_REPORT_PRESETS).optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        category_id: z.uuid().optional(),
        search: z.string().max(160).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) =>
      deps.expenses.listExpenses(sink.user, {
        preset: args.preset,
        from: args.from,
        to: args.to,
        categoryId: args.category_id,
        search: args.search,
        limit: args.limit,
      }),
  );

  sink.tool(
    'create_expense',
    {
      description:
        'Record a new expense. Amount is in Toman. If category_id is omitted or not provided, the AI decision model automatically classifies and assigns the expense to the best category!',
      scope: 'expenses:write',
      kind: 'create',
      input: {
        title: z
          .string()
          .min(1)
          .max(160)
          .describe(
            'What the expense was for, e.g. "کرایه اسنپ", "ناهار رستوران"',
          ),
        amount: z
          .number()
          .int()
          .min(1)
          .max(MAX_EXPENSE_AMOUNT)
          .describe('Amount in Toman'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD Tehran calendar day. Defaults to today.'),
        category_id: z
          .uuid()
          .optional()
          .describe(
            'Specific category ID. Leave empty to let the AI decision model categorize it automatically.',
          ),
        note: z.string().max(1000).optional(),
      },
    },
    async (args) =>
      deps.expenses.createExpense(sink.user, {
        title: args.title,
        amount: args.amount,
        date: args.date,
        categoryId: args.category_id,
        note: args.note,
      }),
  );

  sink.tool(
    'create_expenses_batch',
    {
      description:
        'Record multiple expenses at once (up to 30). For any expense without category_id, the AI decision model automatically categorizes it.',
      scope: 'expenses:write',
      kind: 'create',
      input: {
        expenses: z
          .array(
            z.object({
              title: z.string().min(1).max(160),
              amount: z.number().int().min(1).max(MAX_EXPENSE_AMOUNT),
              date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional(),
              category_id: z.uuid().optional(),
              note: z.string().max(1000).optional(),
            }),
          )
          .min(1)
          .max(30),
      },
    },
    async (args) =>
      deps.expenses.createExpensesBatch(sink.user, {
        expenses: args.expenses.map((e) => ({
          title: e.title,
          amount: e.amount,
          date: e.date,
          categoryId: e.category_id,
          note: e.note,
        })),
      }),
  );

  sink.tool(
    'update_expense',
    {
      description:
        'Update an existing expense: title, amount (in Toman), date, category, or note.',
      scope: 'expenses:write',
      kind: 'update',
      input: {
        id: z.uuid(),
        title: z.string().min(1).max(160).optional(),
        amount: z.number().int().min(1).max(MAX_EXPENSE_AMOUNT).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        category_id: z.uuid().optional(),
        note: z.string().max(1000).optional(),
      },
    },
    async (args) =>
      deps.expenses.updateExpense(sink.user, args.id, {
        title: args.title,
        amount: args.amount,
        date: args.date,
        categoryId: args.category_id,
        note: args.note,
      }),
  );

  sink.tool(
    'delete_expense',
    {
      description: 'Delete an expense permanently by ID.',
      scope: 'expenses:write',
      kind: 'delete',
      input: {
        id: z.uuid(),
      },
    },
    async (args) => deps.expenses.deleteExpense(sink.user, args.id),
  );

  sink.tool(
    'get_expense_report',
    {
      description:
        'Get a comprehensive financial expense report: total spending, daily average, today’s spend, top category, category breakdown with budget progress, daily series, and largest expenses.',
      scope: 'expenses:read',
      kind: 'read',
      input: {
        preset: z.enum(EXPENSE_REPORT_PRESETS).optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        category_id: z.uuid().optional(),
      },
    },
    async (args) =>
      deps.expenses.getReport(sink.user, {
        preset: args.preset,
        from: args.from,
        to: args.to,
        categoryId: args.category_id,
      }),
  );
}
