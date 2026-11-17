import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '@all-in-one/api/auth';
import {
  classifyExpenseSchema,
  createDefaultExpenseCategorySchema,
  createExpenseCategorySchema,
  createExpensesBatchSchema,
  createExpenseSchema,
  expenseQuerySchema,
  updateDefaultExpenseCategorySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  type AdminExpensesOverview,
  type ClassifyExpenseInput,
  type CreateDefaultExpenseCategoryInput,
  type CreateExpenseCategoryInput,
  type CreateExpensesBatchInput,
  type CreateExpenseInput,
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
import { ExpensesEnabledGuard } from './expenses-enabled.guard';
import { ExpensesService } from './expenses.service';

/**
 * Expenses management API. Customers who turned the experiment on, and admins (directive 160); the default-category
 * routes stay admin-only.
 */
@UseGuards(ExpensesEnabledGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Roles('ADMIN')
  @Get('admin/overview')
  getAdminOverview(): Promise<AdminExpensesOverview> {
    return this.expenses.getAdminOverview();
  }

  @Roles('ADMIN')
  @Get('admin/default-categories')
  listDefaultCategories(): Promise<DefaultExpenseCategoryItem[]> {
    return this.expenses.listDefaultCategories();
  }

  @Roles('ADMIN')
  @Post('admin/default-categories')
  createDefaultCategory(
    @Body({ schema: createDefaultExpenseCategorySchema })
    input: CreateDefaultExpenseCategoryInput,
  ): Promise<DefaultExpenseCategoryItem> {
    return this.expenses.createDefaultCategory(input);
  }

  @Roles('ADMIN')
  @Patch('admin/default-categories/:id')
  updateDefaultCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateDefaultExpenseCategorySchema })
    input: UpdateDefaultExpenseCategoryInput,
  ): Promise<DefaultExpenseCategoryItem> {
    return this.expenses.updateDefaultCategory(id, input);
  }

  @Roles('ADMIN')
  @Delete('admin/default-categories/:id')
  @HttpCode(204)
  deleteDefaultCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.expenses.deleteDefaultCategory(id);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser): Promise<ExpenseCategory[]> {
    return this.expenses.listCategories(user.id);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createExpenseCategorySchema })
    input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategory> {
    return this.expenses.createCategory(user.id, input);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateExpenseCategorySchema })
    input: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategory> {
    return this.expenses.updateCategory(user.id, id, input);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.expenses.deleteCategory(user.id, id);
  }

  @Post('classify')
  classify(
    @CurrentUser() user: AuthUser,
    @Body({ schema: classifyExpenseSchema }) input: ClassifyExpenseInput,
  ): Promise<ExpenseClassificationResult> {
    return this.expenses.classify(user.id, input);
  }

  @Get()
  listExpenses(
    @CurrentUser() user: AuthUser,
    @Query({ schema: expenseQuerySchema }) query: ExpenseQueryInput,
  ): Promise<ExpenseItem[]> {
    return this.expenses.listExpenses(user.id, query);
  }

  @Post()
  createExpense(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createExpenseSchema }) input: CreateExpenseInput,
  ): Promise<ExpenseItem> {
    return this.expenses.createExpense(user.id, input);
  }

  @Post('batch')
  createExpensesBatch(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createExpensesBatchSchema })
    input: CreateExpensesBatchInput,
  ): Promise<ExpenseItem[]> {
    return this.expenses.createExpensesBatch(user.id, input);
  }

  @Patch(':id')
  updateExpense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateExpenseSchema }) input: UpdateExpenseInput,
  ): Promise<ExpenseItem> {
    return this.expenses.updateExpense(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteExpense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.expenses.deleteExpense(user.id, id);
  }

  @Get('report')
  getReport(
    @CurrentUser() user: AuthUser,
    @Query({ schema: expenseQuerySchema }) query: ExpenseQueryInput,
  ): Promise<ExpenseReport> {
    return this.expenses.getReport(user.id, query);
  }
}
