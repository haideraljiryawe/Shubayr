import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ExpensesService } from './expenses.service';

@Processor('expense-schedules', { lockDuration: 120_000, maxStalledCount: 2 })
export class ExpenseScheduleProcessor extends WorkerHost {
  constructor(private readonly expenses: ExpensesService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'catch-up') {
      return this.expenses.processDueSchedules();
    }
  }
}
