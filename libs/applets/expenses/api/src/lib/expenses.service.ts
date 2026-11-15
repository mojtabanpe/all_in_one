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
  type ClassifyExpenseInput,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type CreateExpensesBatchInput,
  type ExpenseCategory,
  type ExpenseClassificationResult,
  type ExpenseItem,
  type ExpenseQueryInput,
  type ExpenseReport,
  type UpdateExpenseCategoryInput,
  type UpdateExpenseInput,
} from '@all-in-one/applets/expenses/contracts';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiScope: AiScopeGuard,
  ) {}

  /** Ensures user has the default starter categories if they have none yet. */
  async ensureDefaultCategories(userId: string): Promise<ExpenseCategory[]> {
    const existing = await this.prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length) return existing.map(this.mapCategory);

    await this.prisma.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
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
