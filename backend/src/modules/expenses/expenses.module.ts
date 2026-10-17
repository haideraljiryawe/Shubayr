import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { MediaModule } from '../media/media.module';
import {
  ExpenseCategoriesController,
  ExpenseReceiptsController,
  ExpensesController,
} from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [FinanceModule, MediaModule],
  controllers: [
    ExpenseCategoriesController,
    ExpenseReceiptsController,
    ExpensesController,
  ],
  providers: [ExpensesService],
})
export class ExpensesModule {}
