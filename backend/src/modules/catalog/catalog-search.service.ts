import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Meilisearch } from 'meilisearch';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CatalogSearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogSearchService.name);
  private client?: Meilisearch;
  private readonly indexName = 'products';
  private retryTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.connectAndCatchUp();
    this.retryTimer = setInterval(() => void this.connectAndCatchUp(), 30_000);
    this.retryTimer.unref();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  private async connectAndCatchUp() {
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
    if (!this.client) return;
    const products = await this.prisma.product.findMany({
      include: { brand: true, variants: true },
    });
    const documents = products.map((product) => ({
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
      effective_price: Math.min(
        ...product.variants.map((variant) =>
          Number(
            variant.pricing_mode === 'linked'
              ? (variant.published_price ?? product.price)
              : (variant.selling_price ?? product.price),
          ),
        ),
      ),
      skus: product.variants.map((variant) => variant.sku),
      created_at: product.created_at.getTime(),
    }));
    if (documents.length) {
      const task = await this.client
        .index(this.indexName)
        .addDocuments(documents, { primaryKey: 'id' });
      const completed = await this.client.tasks.waitForTask(task);
      if (completed.status !== 'succeeded')
        throw new Error(
          `Meilisearch rebuild failed: ${completed.error?.message ?? completed.status}`,
        );
    }
    await this.prisma.product.updateMany({
      data: { search_sync_required: false, search_synced_at: new Date() },
    });
  }

  async reindexAll() {
    await this.prisma.product.updateMany({
      data: { search_sync_required: true },
    });
    await this.connectAndCatchUp();
    const remaining = await this.prisma.product.count({
      where: { search_sync_required: true },
    });
    return { queued: remaining, synchronized: remaining === 0 };
  }

  async reindexPending() {
    if (!this.client) return;
    const pending = await this.prisma.product.findMany({
      where: { search_sync_required: true },
      select: { id: true },
      orderBy: { updated_at: 'asc' },
      take: 100,
    });
    for (const product of pending) await this.indexProduct(product.id);
  }

  async indexProduct(id: string) {
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
      const prices = product.variants.map((variant) =>
        Number(
          variant.pricing_mode === 'linked'
            ? (variant.published_price ?? product.price)
            : (variant.selling_price ?? product.price),
        ),
      );
      const task = await this.client.index(this.indexName).addDocuments(
        [
          {
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
          },
        ],
        { primaryKey: 'id' },
      );
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
