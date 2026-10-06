jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { CashReceiptService } from './cash-receipt.service';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';

describe('CashReceiptService business dates', () => {
  afterEach(() => jest.useRealTimers());

  it('dates a reversal on the Baghdad first of the month during the UTC boundary window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T22:30:00.000Z'));
    const dates = {
      validate: jest.fn().mockResolvedValue({
        documentDate: new Date('2026-11-01T00:00:00.000Z'),
        accountingDate: new Date('2026-11-01T00:00:00.000Z'),
      }),
    };
    const operations = { execute: jest.fn().mockResolvedValue({ id: 'ok' }) };
    const service = new CashReceiptService(
      {} as PrismaService,
      {} as AuditService,
      dates as unknown as DateRulesService,
      {} as LedgerService,
      {} as DocumentNumberService,
      operations as unknown as OperationService,
    );

    await service.reverse(
      { id: 'cashier', permissions: ['cash_receipts.reverse'] },
      '11111111-1111-4111-8111-111111111111',
      { operation_id: 'boundary-reversal', reason: 'boundary correction' },
    );

    expect(dates.validate).toHaveBeenCalledWith({
      documentDate: '2026-11-01',
      accountingDate: '2026-11-01',
      permissions: ['cash_receipts.reverse'],
    });
  });
});
