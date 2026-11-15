import { Module } from '@nestjs/common';
import { PrismaModule } from '@all-in-one/api/db';
import { AiModule } from '@all-in-one/api/ai';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

/** Expenses applet backend (categories, expenses, AI decision categorization, reports). */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesApiModule {}
