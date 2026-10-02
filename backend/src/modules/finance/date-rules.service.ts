import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { businessDate } from './business-date';
import { PeriodClosedException } from './period-closed.exception';

export type DateRuleInput = {
  documentDate: string;
  accountingDate?: string;
  backdateReason?: string;
  permissions: readonly string[];
  futureAllowed?: boolean;
};

@Injectable()
export class DateRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(input: DateRuleInput): Promise<{
    documentDate: Date;
    accountingDate: Date;
    backdateReason?: string;
  }> {
    const documentDate = this.parseDate(input.documentDate);
    const accountingDate = this.parseDate(
      input.accountingDate ?? input.documentDate,
    );
    const today = businessDate();
    if (!input.futureAllowed && documentDate > today) {
      throw new UnprocessableEntityException(
        'Future document dates are not allowed',
      );
    }
    if (accountingDate > today) {
      throw new UnprocessableEntityException(
        'Future accounting dates are not allowed',
      );
    }
    const windowDays = Number(
      await this.setting('backdating_window_days', '90'),
    );
    const ageDays = Math.floor(
      (today.getTime() - documentDate.getTime()) / 86_400_000,
    );
    if (ageDays > windowDays) {
      if (!input.permissions.includes('backdate.approve')) {
        throw new ForbiddenException(
          `Documents older than ${windowDays} days require backdate.approve`,
        );
      }
      if (!input.backdateReason?.trim()) {
        throw new UnprocessableEntityException(
          'A reason is required for an approved back-dated document',
        );
      }
    }
    await this.assertOpen(this.prisma, accountingDate);
    return {
      documentDate,
      accountingDate,
      ...(ageDays > windowDays
        ? { backdateReason: input.backdateReason!.trim() }
        : {}),
    };
  }

  async assertOpen(
    client: Pick<Prisma.TransactionClient, 'accountingPeriod'>,
    accountingDate: Date,
  ): Promise<void> {
    const month = new Date(
      Date.UTC(
        accountingDate.getUTCFullYear(),
        accountingDate.getUTCMonth(),
        1,
      ),
    );
    const period = await client.accountingPeriod.findUnique({
      where: { month },
    });
    if (period?.status === 'closed') {
      throw new PeriodClosedException(accountingDate);
    }
  }

  today(): Promise<string> {
    return Promise.resolve(businessDate().toISOString().slice(0, 10));
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new UnprocessableEntityException('Invalid document date');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new UnprocessableEntityException('Invalid document date');
    }
    return date;
  }

  private async setting(key: string, fallback: string): Promise<string> {
    return (
      (await this.prisma.storeSetting.findUnique({ where: { key } }))?.value ??
      fallback
    );
  }
}
