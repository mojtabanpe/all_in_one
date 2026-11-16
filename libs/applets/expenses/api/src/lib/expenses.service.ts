import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import { AiScopeGuard } from '@all-in-one/api/ai';
import {
  buildCategoryCandidateText,
  computeExpenseReport,
  DEFAULT_EXPENSE_CATEGORIES,
  matchExpenseCategoryByKeywords,
  resolveExpenseDateRange,
  tehranIsoDate,
  type AdminExpensesOverview,
  type ClassifyExpenseInput,
  type CreateDefaultExpenseCategoryInput,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type CreateExpensesBatchInput,
  type DefaultExpenseCategoryItem,
  type ExpenseCategory,
  type ExpenseClassificationResult,
  type ExpenseItem,
  type ExpenseQueryInput,
  type ExpenseReport,
  type UpdateDefaultExpenseCategoryInput,
  type UpdateExpenseCategoryInput,
  type UpdateExpenseInput,
} from '@all-in-one/applets/expenses/contracts';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiScope: AiScopeGuard,
  ) {}

  /** Ensures the admin-configured default template table is populated, seeding from constants once if empty. */
  async ensureSeededDefaultTemplates(): Promise<DefaultExpenseCategoryItem[]> {
    const existing = await this.prisma.defaultExpenseCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length) return existing.map(this.mapDefaultCategory);

    await this.prisma.defaultExpenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
        name: cat.name,
        slug: cat.slug,
        color: cat.color,
        icon: cat.icon,
        keywords: cat.keywords,
        sortOrder: cat.sortOrder,
      })),
    });

    const created = await this.prisma.defaultExpenseCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return created.map(this.mapDefaultCategory);
  }

  /** Ensures user has the default starter categories if they have none yet. */
  async ensureDefaultCategories(userId: string): Promise<ExpenseCategory[]> {
    const existing = await this.prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length) return existing.map(this.mapCategory);

    const templates = await this.ensureSeededDefaultTemplates();
    await this.prisma.expenseCategory.createMany({
      data: templates.map((cat) => ({
        userId,
        name: cat.name,
        slug: cat.slug,
        color: cat.color,
        icon: cat.icon,
        keywords: cat.keywords,
        sortOrder: cat.sortOrder,
      })),
    });

    const created = await this.prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });
    return created.map(this.mapCategory);
  }

  async listCategories(userId: string): Promise<ExpenseCategory[]> {
    return this.ensureDefaultCategories(userId);
  }

  async createCategory(
    userId: string,
    input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategory> {
    const highest = await this.prisma.expenseCategory.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextOrder = (highest?.sortOrder ?? -1) + 1;

    const row = await this.prisma.expenseCategory.create({
      data: {
        userId,
        name: input.name.trim(),
        slug: input.slug?.trim() || null,
        color: input.color ?? 'emerald',
        icon: input.icon ?? 'lucideWallet',
        keywords: input.keywords?.trim() ?? '',
        monthlyBudget:
          input.monthlyBudget !== undefined && input.monthlyBudget !== null
            ? BigInt(input.monthlyBudget)
            : null,
        sortOrder: nextOrder,
      },
    });
    return this.mapCategory(row);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategory> {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, userId },
    });
    if (!existing) throw new NotFoundException('دسته‌بندی یافت نشد.');

    const row = await this.prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        slug: input.slug !== undefined ? input.slug?.trim() || null : undefined,
        color: input.color ?? undefined,
        icon: input.icon ?? undefined,
        keywords:
          input.keywords !== undefined ? input.keywords.trim() : undefined,
        monthlyBudget:
          input.monthlyBudget !== undefined
            ? input.monthlyBudget !== null
              ? BigInt(input.monthlyBudget)
              : null
            : undefined,
      },
    });
    return this.mapCategory(row);
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, userId },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('دسته‌بندی یافت نشد.');
    if (existing._count.expenses > 0) {
      throw new BadRequestException(
        'این دسته‌بندی دارای هزینهٔ ثبت‌شده است و نمی‌توان آن را حذف کرد.',
      );
    }
    await this.prisma.expenseCategory.delete({ where: { id: categoryId } });
  }

  /**
   * Classifies an expense into the best matching category using the AI decision model
   * (local MiniLM embedding ranking, Jev, or chat model), falling back to keywords.
   */
  async classify(
    userId: string,
    input: ClassifyExpenseInput,
  ): Promise<ExpenseClassificationResult> {
    const categories = await this.ensureDefaultCategories(userId);
    if (!categories.length) {
      throw new BadRequestException('هیچ دسته‌بندی برای هزینه‌ها وجود ندارد.');
    }

    const titleAndNote = [input.title, input.note].filter(Boolean).join(' - ');

    // 1. Try the AI decision model (local, Jev, or chat) via AiScopeGuard.chooseOption
    const options = categories.map((cat) => ({
      id: cat.id,
      label: cat.name,
      description: buildCategoryCandidateText(cat),
    }));

    const aiChoice = await this.aiScope.chooseOption(
      userId,
      titleAndNote,
      options,
    );
    if (aiChoice) {
      const match = categories.find((c) => c.id === aiChoice.id);
      if (match) {
        return {
          categoryId: match.id,
          categoryName: match.name,
          decidedBy: aiChoice.provider,
          confidence: aiChoice.confidence,
        };
      }
    }

    // 2. Deterministic keyword fallback
    const keywordMatch = matchExpenseCategoryByKeywords(
      titleAndNote,
      categories,
    );
    if (keywordMatch) {
      const match = categories.find((c) => c.id === keywordMatch.categoryId);
      if (match) {
        return {
          categoryId: match.id,
          categoryName: match.name,
          decidedBy: 'keywords',
          confidence: Math.min(1, keywordMatch.score / 5),
        };
      }
    }

    // 3. Fallback to "other" category or first available category
    const otherCat =
      categories.find((c) => c.slug === 'other') ?? categories[0];
    return {
      categoryId: otherCat.id,
      categoryName: otherCat.name,
      decidedBy: 'fallback',
      confidence: null,
    };
  }

  async createExpense(
    userId: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseItem> {
    const categories = await this.ensureDefaultCategories(userId);

    let categoryId = input.categoryId ?? null;
    let decidedBy = 'user';

    if (!categoryId) {
      const classification = await this.classify(userId, {
        title: input.title,
        note: input.note,
      });
      categoryId = classification.categoryId;
      decidedBy = classification.decidedBy;
    } else {
      const exists = categories.find((c) => c.id === categoryId);
      if (!exists) {
        throw new NotFoundException('دسته‌بندی مشخص‌شده پیدا نشد.');
      }
    }

    const dateIso = input.date ?? tehranIsoDate();
    const dateUtc = new Date(`${dateIso}T00:00:00Z`);

    const row = await this.prisma.expense.create({
      data: {
        userId,
        categoryId,
        title: input.title.trim(),
        amount: BigInt(input.amount),
        date: dateUtc,
        note: input.note?.trim() || null,
        decidedBy,
      },
      include: {
        category: true,
      },
    });

    return this.mapExpense(row);
  }

  async createExpensesBatch(
    userId: string,
    input: CreateExpensesBatchInput,
  ): Promise<ExpenseItem[]> {
    const results: ExpenseItem[] = [];
    for (const item of input.expenses) {
      const created = await this.createExpense(userId, item);
      results.push(created);
    }
    return results;
  }

  async listExpenses(
    userId: string,
    query: ExpenseQueryInput,
  ): Promise<ExpenseItem[]> {
    const range = resolveExpenseDateRange(query);
    const fromDate = new Date(`${range.from}T00:00:00Z`);
    const toDate = new Date(`${range.to}T00:00:00Z`);

    const where = {
      userId,
      date: {
        gte: fromDate,
        lte: toDate,
      },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                note: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 200,
    });

    return rows.map(this.mapExpense);
  }

  async updateExpense(
    userId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseItem> {
    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!existing) throw new NotFoundException('هزینه پیدا نشد.');

    if (input.categoryId) {
      const cat = await this.prisma.expenseCategory.findFirst({
        where: { id: input.categoryId, userId },
      });
      if (!cat) throw new NotFoundException('دسته‌بندی مشخص‌شده پیدا نشد.');
    }

    const row = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        title: input.title !== undefined ? input.title.trim() : undefined,
        amount: input.amount !== undefined ? BigInt(input.amount) : undefined,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : undefined,
        categoryId: input.categoryId ?? undefined,
        note: input.note !== undefined ? input.note?.trim() || null : undefined,
      },
      include: { category: true },
    });

    return this.mapExpense(row);
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    const existing = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!existing) throw new NotFoundException('هزینه پیدا نشد.');
    await this.prisma.expense.delete({ where: { id: expenseId } });
  }

  async getReport(
    userId: string,
    query: ExpenseQueryInput,
  ): Promise<ExpenseReport> {
    const range = resolveExpenseDateRange(query);
    const categories = await this.ensureDefaultCategories(userId);

    const fromDate = new Date(`${range.from}T00:00:00Z`);
    const toDate = new Date(`${range.to}T00:00:00Z`);

    const rows = await this.prisma.expense.findMany({
      where: {
        userId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const items = rows.map(this.mapExpense);

    const todayIso = tehranIsoDate();
    const todayRows = await this.prisma.expense.findMany({
      where: {
        userId,
        date: new Date(`${todayIso}T00:00:00Z`),
      },
      select: { amount: true },
    });
    const todayAmount = todayRows.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );

    return computeExpenseReport(
      items,
      categories,
      range.from,
      range.to,
      todayAmount,
    );
  }

  // ---- Admin: default category templates & platform overview ----

  async listDefaultCategories(): Promise<DefaultExpenseCategoryItem[]> {
    return this.ensureSeededDefaultTemplates();
  }

  async createDefaultCategory(
    input: CreateDefaultExpenseCategoryInput,
  ): Promise<DefaultExpenseCategoryItem> {
    await this.ensureSeededDefaultTemplates();
    const highest = await this.prisma.defaultExpenseCategory.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextOrder = input.sortOrder ?? (highest?.sortOrder ?? -1) + 1;

    const row = await this.prisma.defaultExpenseCategory.create({
      data: {
        name: input.name.trim(),
        slug: input.slug?.trim() || null,
        color: input.color ?? 'emerald',
        icon: input.icon ?? 'lucideWallet',
        keywords: input.keywords?.trim() ?? '',
        sortOrder: nextOrder,
      },
    });
    return this.mapDefaultCategory(row);
  }

  async updateDefaultCategory(
    id: string,
    input: UpdateDefaultExpenseCategoryInput,
  ): Promise<DefaultExpenseCategoryItem> {
    const existing = await this.prisma.defaultExpenseCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('دسته‌بندی پیش‌فرض یافت نشد.');

    const row = await this.prisma.defaultExpenseCategory.update({
      where: { id },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        slug: input.slug !== undefined ? input.slug?.trim() || null : undefined,
        color: input.color ?? undefined,
        icon: input.icon ?? undefined,
        keywords:
          input.keywords !== undefined ? input.keywords.trim() : undefined,
        sortOrder: input.sortOrder ?? undefined,
      },
    });
    return this.mapDefaultCategory(row);
  }

  async deleteDefaultCategory(id: string): Promise<void> {
    const existing = await this.prisma.defaultExpenseCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('دسته‌بندی پیش‌فرض یافت نشد.');
    await this.prisma.defaultExpenseCategory.delete({ where: { id } });
  }

  async getAdminOverview(): Promise<AdminExpensesOverview> {
    await this.ensureSeededDefaultTemplates();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      usersWithExpenses,
      active7,
      active30,
      usersWithCategories,
      expenseAgg,
      expenses30Count,
      totalCategoriesCount,
      defaultCategoriesCount,
      aiDecidedCount,
    ] = await Promise.all([
      this.prisma.expense.groupBy({ by: ['userId'] }),
      this.prisma.expense.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.expense.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.expenseCategory.groupBy({ by: ['userId'] }),
      this.prisma.expense.aggregate({
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.expense.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.expenseCategory.count(),
      this.prisma.defaultExpenseCategory.count(),
      this.prisma.expense.count({
        where: { decidedBy: { not: 'user' } },
      }),
    ]);

    return {
      totalUsersWithExpenses: usersWithExpenses.length,
      activeUsersLast7Days: active7.length,
      activeUsersLast30Days: active30.length,
      totalUsersWithCategories: usersWithCategories.length,
      totalExpensesCount: expenseAgg._count._all,
      totalAmount: Number(expenseAgg._sum.amount ?? 0n),
      expensesLast30DaysCount: expenses30Count,
      totalCategoriesCount,
      defaultCategoriesCount,
      aiDecidedCount,
    };
  }

  private mapDefaultCategory(
    row: import('@all-in-one/api/db').DefaultExpenseCategory,
  ): DefaultExpenseCategoryItem {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color as ExpenseCategory['color'],
      icon: row.icon as ExpenseCategory['icon'],
      keywords: row.keywords,
      sortOrder: row.sortOrder,
    };
  }

  private mapCategory(
    row: import('@all-in-one/api/db').ExpenseCategory,
  ): ExpenseCategory {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      color: row.color as ExpenseCategory['color'],
      icon: row.icon as ExpenseCategory['icon'],
      keywords: row.keywords,
      monthlyBudget:
        row.monthlyBudget !== null ? Number(row.monthlyBudget) : null,
      sortOrder: row.sortOrder,
    };
  }

  private mapExpense(
    row: import('@all-in-one/api/db').Expense & {
      category: import('@all-in-one/api/db').ExpenseCategory;
    },
  ): ExpenseItem {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      categoryColor: row.category.color as ExpenseItem['categoryColor'],
      categoryIcon: row.category.icon as ExpenseItem['categoryIcon'],
      title: row.title,
      amount: Number(row.amount),
      date: row.date.toISOString().slice(0, 10),
      note: row.note,
      decidedBy: row.decidedBy as ExpenseItem['decidedBy'],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
