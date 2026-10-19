jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));
jest.mock('../media/object-storage.service', () => ({
  ObjectStorageService: class {},
}));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: jest.fn(() => () => undefined),
}));

import { ReportExportService } from './report-export.service';

const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  permissions: ['reports.sales.read'],
};

describe('ReportExportService', () => {
  it('returns a progress-only shape with no report rows', async () => {
    const service = new ReportExportService(
      {
        reportExport: {
          findUnique: jest.fn().mockResolvedValue({
            id: '22222222-2222-4222-8222-222222222222',
            report_type: 'sales',
            format: 'csv',
            language: 'en',
            status: 'processing',
            rows_done: 250,
            rows_total: 1000,
            last_error: null,
            object_key: null,
            created_at: new Date('2026-10-18T00:00:00Z'),
            started_at: new Date('2026-10-18T00:00:01Z'),
            completed_at: null,
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.progress(
      '22222222-2222-4222-8222-222222222222',
      actor,
    );
    expect(result).toEqual(
      expect.objectContaining({ rows_done: 250, rows_total: 1000 }),
    );
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('rows');
  });

  it('writes a UTF-8 BOM and Arabic headings in CSV exports', () => {
    const service = new ReportExportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const buffer = service['csv'](
      [{ key: 'sku-1', net_sales: '1000.0000' }],
      'ar',
    );
    expect(buffer.subarray(0, 3).toString('hex')).toBe('efbbbf');
    expect(buffer.toString('utf8')).toContain('صافي المبيعات');
  });
});
