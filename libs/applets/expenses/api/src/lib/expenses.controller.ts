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
} from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '@all-in-one/api/auth';
import {
  classifyExpenseSchema,
  createExpenseCategorySchema,
  createExpensesBatchSchema,
  createExpenseSchema,
  expenseQuerySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  type ClassifyExpenseInput,
  type CreateExpenseCategoryInput,
  type CreateExpensesBatchInput,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ExpenseClassificationResult,
  type ExpenseItem,
  type ExpenseQueryInput,
  type ExpenseReport,
  type UpdateExpenseCategoryInput,
  type UpdateExpenseInput,
} from '@all-in-one/applets/expenses/contracts';
import { ExpensesService } from './expenses.service';

/**
 * Expenses management API. Restricted to ADMIN users as requested.
 */
@Roles('ADMIN')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

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
