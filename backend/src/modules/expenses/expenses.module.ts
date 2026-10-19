import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { runsBackgroundJobs } from '../../config/process-role';
import { FinanceModule } from '../finance/finance.module';
import { MediaModule } from '../media/media.module';
import {
  ExpenseCategoriesController,
  ExpenseReceiptsController,
  ExpensesController,
} from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseScheduleProcessor } from './expense-schedule.processor';
import { ExpenseScheduleScheduler } from './expense-schedule.scheduler';

export const expenseWorkerProviders = () =>
  runsBackgroundJobs()
    ? [ExpenseScheduleProcessor, ExpenseScheduleScheduler]
    : [];

@Module({
  imports: [
    FinanceModule,
    MediaModule,
    BullModule.registerQueue({ name: 'expense-schedules' }),
  ],
  controllers: [
    ExpenseCategoriesController,
    ExpenseReceiptsController,
    ExpensesController,
  ],
  providers: [ExpensesService, ...expenseWorkerProviders()],
})
export class ExpensesModule {}
