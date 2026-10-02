import { ConflictException } from '@nestjs/common';

export class PeriodClosedException extends ConflictException {
  constructor(accountingDate: Date) {
    const period = accountingDate.toISOString().slice(0, 7);
    super({
      status: 409,
      code: 'PERIOD_CLOSED',
      message: `Accounting period ${period} is closed`,
      errors: [],
      period,
    });
  }
}
