import type { Queue } from 'bullmq';

jest.mock('@nestjs/bullmq', () => ({
  BullModule: {
    registerQueue: jest.fn(() => class {}),
    forRootAsync: jest.fn(() => class {}),
  },
  InjectQueue: jest.fn(() => () => undefined),
  Processor: jest.fn(() => (target: unknown) => target),
  WorkerHost: class {},
}));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { catalogImportWorkerProviders } from './catalog-import/catalog-import.module';
import { CatalogImportProcessor } from './catalog-import/catalog-import.processor';
import { CatalogImportScheduler } from './catalog-import/catalog-import.scheduler';
import { catalogSearchWorkerProviders } from './catalog/catalog.module';
import { CatalogSearchScheduler } from './catalog/catalog-search.scheduler';
import { notificationWorkerProviders } from './notifications/notifications.module';
import { NotificationsProcessor } from './notifications/notifications.processor';
import { NotificationsScheduler } from './notifications/notifications.scheduler';
import { orderWorkerProviders } from './orders/orders.module';
import { OrderTimeoutScheduler } from './orders/order-timeout.scheduler';
import { reportWorkerProviders } from './reports/reports.module';
import { ReportExportProcessor } from './reports/report-export.processor';
import { ReportExportScheduler } from './reports/report-export.scheduler';

describe('background job roles and scheduling', () => {
  const originalRole = process.env.PROCESS_ROLE;

  afterEach(() => {
    if (originalRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = originalRole;
  });

  it('registers no processors or schedulers in API mode', () => {
    process.env.PROCESS_ROLE = 'api';
    expect(notificationWorkerProviders()).toEqual([]);
    expect(catalogImportWorkerProviders()).toEqual([]);
    expect(catalogSearchWorkerProviders()).toEqual([]);
    expect(orderWorkerProviders()).toEqual([]);
    expect(reportWorkerProviders()).toEqual([]);
  });

  it('registers every processor and scheduler in worker mode', () => {
    process.env.PROCESS_ROLE = 'worker';
    expect(notificationWorkerProviders()).toHaveLength(2);
    expect(catalogImportWorkerProviders()).toHaveLength(2);
    expect(catalogSearchWorkerProviders()).toHaveLength(2);
    expect(orderWorkerProviders()).toHaveLength(2);
    expect(reportWorkerProviders()).toHaveLength(2);
  });

  it('upserts stable scheduler ids when two workers start', async () => {
    const schedulers = new Map<string, unknown>();
    const upsertJobScheduler = jest.fn((id: string, repeat: unknown) => {
      schedulers.set(id, repeat);
      return Promise.resolve({ id });
    });
    const queue = {
      upsertJobScheduler,
    } as unknown as Queue;
    const factories = [
      () => new NotificationsScheduler(queue),
      () => new CatalogImportScheduler(queue),
      () => new CatalogSearchScheduler(queue),
      () => new OrderTimeoutScheduler(queue),
      () => new ReportExportScheduler(queue),
    ];

    for (const factory of factories) {
      await factory().onApplicationBootstrap();
      await factory().onApplicationBootstrap();
    }

    expect(schedulers.size).toBe(6);
    expect(upsertJobScheduler).toHaveBeenCalledTimes(12);
  });

  it('worker processors dispatch notifications and import batches', async () => {
    const notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      enqueuePending: jest.fn().mockResolvedValue(undefined),
    };
    const stream = { publishPending: jest.fn().mockResolvedValue(undefined) };
    const notificationProcessor = new NotificationsProcessor(
      notifications as never,
      stream as never,
    );
    await notificationProcessor.process({
      name: 'fanout',
      data: { eventId: 'event-1' },
    } as never);
    expect(notifications.dispatch).toHaveBeenCalledWith('event-1');

    const imports = {
      processCommit: jest.fn().mockResolvedValue(undefined),
    };
    const importProcessor = new CatalogImportProcessor(imports as never);
    await importProcessor.process({
      name: 'commit',
      data: { importId: 'import-1', commitAttempt: 2 },
    } as never);
    expect(imports.processCommit).toHaveBeenCalledWith('import-1', 2);

    const exports = { process: jest.fn().mockResolvedValue(undefined) };
    const exportProcessor = new ReportExportProcessor(exports as never);
    await exportProcessor.process({
      name: 'generate',
      data: { exportId: 'export-1' },
    } as never);
    expect(exports.process).toHaveBeenCalledWith('export-1');
  });

  it('propagates an interrupted job so BullMQ can retry it', async () => {
    const interrupted = new Error('worker is stopping');
    const processor = new CatalogImportProcessor({
      processCommit: jest.fn().mockRejectedValue(interrupted),
    } as never);

    await expect(
      processor.process({
        name: 'commit',
        data: { importId: 'import-1', commitAttempt: 1 },
      } as never),
    ).rejects.toBe(interrupted);
  });
});
