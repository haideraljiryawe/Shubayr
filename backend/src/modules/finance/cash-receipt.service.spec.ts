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

  it('requires the allocation permission when the receipt includes allocations', async () => {
    const service = new CashReceiptService(
      {} as PrismaService,
      {} as AuditService,
      {} as DateRulesService,
      {} as LedgerService,
      {} as DocumentNumberService,
      {} as OperationService,
    );

    await expect(
      service.create(
        { id: 'cashier', permissions: ['cash_receipts.receive'] },
        {
          operation_id: 'permission-check',
          document_date: '2026-11-01',
          party_id: '11111111-1111-4111-8111-111111111111',
          cash_account_id: '22222222-2222-4222-8222-222222222222',
          amount_iqd: '10',
          allocations: [
            {
              order_id: '33333333-3333-4333-8333-333333333333',
              amount_iqd: '10',
            },
          ],
        },
      ),
    ).rejects.toThrow(
      'Allocating a new receipt requires cash_receipts.allocate',
    );
  });
});
