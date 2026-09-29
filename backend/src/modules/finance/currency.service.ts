import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyUpdateDto, ExchangeRateCreateDto } from './dto/finance.dto';
import { DateRulesService } from './date-rules.service';

@Injectable()
export class CurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateRulesService,
  ) {}

  list() {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
  }

  async update(code: string, actorId: string, input: CurrencyUpdateDto) {
    const existing = await this.prisma.currency.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException('Currency not found');
    if (input.is_base !== undefined && input.is_base !== existing.is_base) {
      if (await this.hasMovements()) {
        throw new ConflictException(
          'The base currency cannot change after a financial movement',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.is_base) {
        await tx.currency.updateMany({
          where: { is_base: true, code: { not: code } },
          data: { is_base: false },
        });
      }
      const updated = await tx.currency.update({
        where: { code },
        data: {
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.is_base === undefined ? {} : { is_base: input.is_base }),
          updated_at: new Date(),
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'currency.update',
        entityType: 'currency',
        before: existing,
        after: updated,
      });
      return updated;
    });
  }

  async listRates(currencyCode?: string) {
    const rates = await this.prisma.exchangeRate.findMany({
      where: currencyCode ? { currency_code: currencyCode } : undefined,
      orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const [base, today] = await Promise.all([
      this.baseCurrency(),
      this.dates.today(),
    ]);
    return rates.map((rate) => this.presentRate(rate, base.code, today));
  }

  async createRate(actorId: string, input: ExchangeRateCreateDto) {
    const currency = await this.prisma.currency.findUnique({
      where: { code: input.currency_code },
    });
    if (!currency?.enabled || currency.is_base) {
      throw new UnprocessableEntityException(
        'An enabled foreign currency is required',
      );
    }
    const entered = new Prisma.Decimal(input.rate);
    if (!entered.gt(0)) {
      throw new UnprocessableEntityException('Exchange rate must be positive');
    }
    const normalized = input.basis === 100 ? entered.dividedBy(100) : entered;
    if (!normalized.gt(0)) {
      throw new UnprocessableEntityException('Exchange rate must be positive');
    }
    const [base, today] = await Promise.all([
      this.baseCurrency(),
      this.dates.today(),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const rate = await tx.exchangeRate.create({
        data: {
          currency_code: input.currency_code,
          rate: normalized,
          effective_at: new Date(input.effective_at),
          set_by: actorId,
          reason: input.reason,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'exchange_rate.create',
        entityType: 'exchange_rate',
        entityId: rate.id,
        after: {
          ...rate,
          entered_rate: input.rate,
          entered_basis: input.basis,
        },
        reason: input.reason,
      });
      return this.presentRate(rate, base.code, today);
    });
  }

  async applicable(currencyCode: string, at: Date) {
    const base = await this.baseCurrency();
    if (currencyCode === base.code) {
      return {
        currency_code: currencyCode,
        base_currency_code: base.code,
        rate: '1',
        effective_at: null,
        not_from_today: false,
      };
    }
    const rate = await this.prisma.exchangeRate.findFirst({
      where: { currency_code: currencyCode, effective_at: { lte: at } },
      orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
    });
    if (!rate) {
      throw new UnprocessableEntityException(
        `No exchange rate exists for ${currencyCode} at the requested date`,
      );
    }
    return this.presentRate(rate, base.code, await this.dates.today());
  }

  async requireRate(currencyCode: string, at: Date): Promise<Prisma.Decimal> {
    const applicable = await this.applicable(currencyCode, at);
    return new Prisma.Decimal(applicable.rate);
  }

  async baseCurrency() {
    const base = await this.prisma.currency.findFirst({
      where: { is_base: true },
    });
    if (!base) throw new ConflictException('No base currency is configured');
    return base;
  }

  private async hasMovements(): Promise<boolean> {
    return (await this.prisma.journalEntry.count({ take: 1 })) > 0;
  }

  private presentRate(
    rate: {
      id: string;
      currency_code: string;
      rate: Prisma.Decimal;
      effective_at: Date;
      set_by: string;
      reason: string;
      created_at: Date;
    },
    baseCurrencyCode: string,
    timezoneToday: string,
  ) {
    const rateDay = rate.effective_at.toISOString().slice(0, 10);
    return {
      ...rate,
      rate: rate.rate.toFixed(10).replace(/\.?0+$/, ''),
      base_currency_code: baseCurrencyCode,
      direction: `1 ${rate.currency_code} = X ${baseCurrencyCode}`,
      not_from_today: rateDay !== timezoneToday,
    };
  }
}
