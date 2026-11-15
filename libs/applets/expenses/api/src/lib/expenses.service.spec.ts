import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@all-in-one/api/db';
import type { AiScopeGuard } from '@all-in-one/api/ai';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let categoriesInDb: any[] = [];
  let expensesInDb: any[] = [];
  let aiChooseOptionMock: any;

  beforeEach(() => {
    categoriesInDb = [];
    expensesInDb = [];
    aiChooseOptionMock = vi.fn().mockResolvedValue(null);

    const prismaMock = {
      expenseCategory: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          return categoriesInDb.filter((c) => c.userId === where.userId);
        }),
        findFirst: vi.fn().mockImplementation(({ where, include }) => {
          const match = categoriesInDb.find(
            (c) =>
              (where.id ? c.id === where.id : true) &&
              (where.userId ? c.userId === where.userId : true),
          );
          if (!match) return null;
          if (include?._count?.select?.expenses) {
            const count = expensesInDb.filter(
              (e) => e.categoryId === match.id,
            ).length;
            return { ...match, _count: { expenses: count } };
          }
          return match;
        }),
        createMany: vi.fn().mockImplementation(({ data }) => {
          data.forEach((item: any, i: number) => {
            categoriesInDb.push({
              ...item,
              id: `cat-${i + 1}`,
              monthlyBudget: null,
            });
          });
          return { count: data.length };
        }),
        create: vi.fn().mockImplementation(({ data }) => {
          const created = {
            id: `cat-${categoriesInDb.length + 1}`,
            ...data,
          };
          categoriesInDb.push(created);
          return created;
        }),
        update: vi.fn().mockImplementation(({ where, data }) => {
          const cat = categoriesInDb.find((c) => c.id === where.id);
          Object.assign(cat, data);
          return cat;
        }),
        delete: vi.fn().mockImplementation(({ where }) => {
          categoriesInDb = categoriesInDb.filter((c) => c.id !== where.id);
        }),
      },
      expense: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          return expensesInDb
            .filter((e) => e.userId === where.userId)
            .map((e) => ({
              ...e,
              category: categoriesInDb.find((c) => c.id === e.categoryId),
            }));
        }),
        findFirst: vi.fn().mockImplementation(({ where }) => {
          const match = expensesInDb.find(
            (e) =>
              (where.id ? e.id === where.id : true) &&
              (where.userId ? e.userId === where.userId : true),
          );
          if (!match) return null;
          return {
            ...match,
            category: categoriesInDb.find((c) => c.id === match.categoryId),
          };
        }),
        create: vi.fn().mockImplementation(({ data }) => {
          const created = {
            id: `exp-${expensesInDb.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          expensesInDb.push(created);
          return {
            ...created,
            category: categoriesInDb.find((c) => c.id === data.categoryId),
          };
        }),
        update: vi.fn().mockImplementation(({ where, data }) => {
          const exp = expensesInDb.find((e) => e.id === where.id);
          Object.assign(exp, data);
          return {
            ...exp,
            category: categoriesInDb.find((c) => c.id === exp.categoryId),
          };
        }),
        delete: vi.fn().mockImplementation(({ where }) => {
          expensesInDb = expensesInDb.filter((e) => e.id !== where.id);
        }),
      },
    };

    const aiScopeMock = {
      chooseOption: aiChooseOptionMock,
    } as unknown as AiScopeGuard;

    service = new ExpensesService(
      prismaMock as unknown as PrismaService,
      aiScopeMock,
    );
  });

  it('initializes default categories for a new user', async () => {
    const cats = await service.listCategories('u1');
    expect(cats.length).toBe(7);
    expect(cats.map((c) => c.slug)).toContain('food');
    expect(cats.map((c) => c.slug)).toContain('transport');
  });

  it('classifies expense via AI decision model when decision model succeeds', async () => {
    const cats = await service.ensureDefaultCategories('u1');
    const foodCat = cats.find((c) => c.slug === 'food')!;

    aiChooseOptionMock.mockResolvedValueOnce({
      id: foodCat.id,
      confidence: 0.95,
      provider: 'local',
    });

    const result = await service.classify('u1', {
      title: 'شام پیتزا با دوستان',
    });

    expect(result.categoryId).toBe(foodCat.id);
    expect(result.decidedBy).toBe('local');
    expect(result.confidence).toBe(0.95);
  });

  it('falls back to keyword matching when AI decision model returns null', async () => {
    const cats = await service.ensureDefaultCategories('u1');
    const transportCat = cats.find((c) => c.slug === 'transport')!;

    aiChooseOptionMock.mockResolvedValueOnce(null);

    const result = await service.classify('u1', {
      title: 'کرایه اسنپ برگشت از شرکت',
    });

    expect(result.categoryId).toBe(transportCat.id);
    expect(result.decidedBy).toBe('keywords');
  });

  it('automatically classifies category when creating expense without categoryId', async () => {
    const cats = await service.ensureDefaultCategories('u1');
    const transportCat = cats.find((c) => c.slug === 'transport')!;

    aiChooseOptionMock.mockResolvedValueOnce({
      id: transportCat.id,
      confidence: 0.92,
      provider: 'chat',
    });

    const expense = await service.createExpense('u1', {
      title: 'بنزین ماشین',
      amount: 150_000,
    });

    expect(expense.categoryId).toBe(transportCat.id);
    expect(expense.decidedBy).toBe('chat');
    expect(expense.amount).toBe(150_000);
  });

  it('prevents deleting a category that has recorded expenses', async () => {
    const cats = await service.ensureDefaultCategories('u1');
    await service.createExpense('u1', {
      title: 'خرید نان',
      amount: 20_000,
      categoryId: cats[0].id,
    });

    await expect(service.deleteCategory('u1', cats[0].id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('calculates reports accurately', async () => {
    const cats = await service.ensureDefaultCategories('u1');
    await service.createExpense('u1', {
      title: 'ناهار',
      amount: 300_000,
      categoryId: cats[0].id,
      date: '2026-11-15',
    });
    await service.createExpense('u1', {
      title: 'اسنپ',
      amount: 100_000,
      categoryId: cats[1].id,
      date: '2026-11-15',
    });

    const report = await service.getReport('u1', {
      from: '2026-11-15',
      to: '2026-11-15',
    });

    expect(report.totalAmount).toBe(400_000);
    expect(report.transactionCount).toBe(2);
    expect(report.todayAmount).toBe(400_000);
    expect(report.topCategory?.categoryId).toBe(cats[0].id);
  });
});
