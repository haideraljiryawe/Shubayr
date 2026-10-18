import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Meilisearch } from 'meilisearch';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { processRole } from '../../config/process-role';

type SearchProduct = Prisma.ProductGetPayload<{
  include: { brand: true; variants: true };
}>;

@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name);
  private client?: Meilisearch;
  private readonly indexName = 'products';

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject('BullQueue_catalog-search')
    private readonly queue?: Queue,
  ) {}

  async onModuleInit() {
    if (processRole() === 'all') await this.connectAndCatchUp();
  }

  async connectAndCatchUp() {
    try {
      if (!this.client) {
        const { Meilisearch } = await import('meilisearch');
        this.client = new Meilisearch({
          host: process.env.MEILI_HOST ?? 'http://localhost:7700',
          apiKey: process.env.MEILI_MASTER_KEY,
        });
      }
      const index = this.client.index(this.indexName);
      await Promise.all([
        index.updateFilterableAttributes([
          'brand_id',
          'category_id',
          'status',
          'published',
        ]),
        index.updateSearchableAttributes([
          'name_en',
          'name_ar',
          'description',
          'brand_name_en',
          'brand_name_ar',
          'skus',
        ]),
        index.updateSortableAttributes(['created_at', 'effective_price']),
      ]);
      await this.reindexPending();
    } catch (error) {
      // A client is created before the first network request. Do not retain it
      // when startup synchronization fails or later writes will retry that
      // known-bad connection and turn an already-committed catalog write into
      // an HTTP 500.
      this.client = undefined;
      this.logger.warn(
        `Catalog search sync deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async rebuild() {
    await this.prisma.product.updateMany({
      data: { search_sync_required: true },
    });
    await this.requestCatchUp();
  }

  private document(product: SearchProduct) {
    const prices = product.variants.map((variant) =>
      Number(
        variant.pricing_mode === 'linked'
          ? (variant.published_price ?? product.price)
          : (variant.selling_price ?? product.price),
      ),
    );
    return {
      id: product.id,
      category_id: product.category_id,
      brand_id: product.brand_id,
      brand_name_en: product.brand?.name_en ?? null,
      brand_name_ar: product.brand?.name_ar ?? null,
      name_en: product.name_en,
      name_ar: product.name_ar,
      description: product.description,
      status: product.status,
      published: product.published_at !== null,
      effective_price: prices.length
        ? Math.min(...prices)
        : Number(product.price),
      skus: product.variants.map((variant) => variant.sku),
      created_at: product.created_at.getTime(),
    };
  }

  async reindexAll() {
    await this.prisma.product.updateMany({
      data: { search_sync_required: true },
    });
    await this.requestCatchUp();
    const remaining = await this.prisma.product.count({
      where: { search_sync_required: true },
    });
    return { queued: remaining, synchronized: remaining === 0 };
  }

  async reindexPending() {
    if (!this.client) return;
    for (;;) {
      const pending = await this.prisma.product.findMany({
        where: { search_sync_required: true },
        include: { brand: true, variants: true },
        orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      if (!pending.length) return;
      const task = await this.client.index(this.indexName).addDocuments(
        pending.map((product) => this.document(product)),
        { primaryKey: 'id' },
      );
      const completed = await this.client.tasks.waitForTask(task);
      if (completed.status !== 'succeeded')
        throw new Error(
          `Meilisearch catch-up failed: ${completed.error?.message ?? completed.status}`,
        );
      await this.prisma.product.updateMany({
        where: { id: { in: pending.map(({ id }) => id) } },
        data: { search_sync_required: false, search_synced_at: new Date() },
      });
    }
  }

  async indexProduct(id: string) {
    if (processRole() === 'api') {
      if (!this.queue) throw new Error('Catalog search queue is unavailable');
      try {
        await this.queue.add(
          'index-product',
          { productId: id },
          {
            jobId: `product-${id}`,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Catalog search enqueue deferred for ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    await this.syncProduct(id);
  }

  private async requestCatchUp() {
    if (processRole() !== 'api') {
      await this.connectAndCatchUp();
      return;
    }
    if (!this.queue) throw new Error('Catalog search queue is unavailable');
    try {
      await this.queue.add(
        'catch-up',
        {},
        {
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Catalog search catch-up enqueue deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async syncProduct(id: string) {
    if (!this.client) return;
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: { brand: true, variants: true },
      });
      if (!product) {
        const task = await this.client.index(this.indexName).deleteDocument(id);
        const completed = await this.client.tasks.waitForTask(task);
        if (completed.status !== 'succeeded')
          throw new Error(
            `Meilisearch deletion failed: ${completed.error?.message ?? completed.status}`,
          );
        return;
      }
      const task = await this.client
        .index(this.indexName)
        .addDocuments([this.document(product)], { primaryKey: 'id' });
      const completed = await this.client.tasks.waitForTask(task);
      if (completed.status !== 'succeeded')
        throw new Error(
          `Meilisearch indexing failed: ${completed.error?.message ?? completed.status}`,
        );
      await this.prisma.product.update({
        where: { id },
        data: { search_sync_required: false, search_synced_at: new Date() },
      });
    } catch (error) {
      this.client = undefined;
      this.logger.warn(
        `Catalog search update deferred for ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
