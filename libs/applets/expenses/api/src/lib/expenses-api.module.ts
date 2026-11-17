import { Module } from '@nestjs/common';
import { PrismaModule } from '@all-in-one/api/db';
import { AiModule } from '@all-in-one/api/ai';
import { ExpensesController } from './expenses.controller';
import { ExpensesEnabledGuard } from './expenses-enabled.guard';
import { ExpensesService } from './expenses.service';

/** Expenses applet backend (categories, expenses, AI decision categorization, reports). */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpensesEnabledGuard],
  exports: [ExpensesService],
})
export class ExpensesApiModule {}
