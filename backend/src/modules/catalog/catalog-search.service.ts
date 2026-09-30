import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Meilisearch } from 'meilisearch';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CatalogSearchService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSearchService.name);
  private client?: Meilisearch;
  private readonly indexName = 'products';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const { Meilisearch } = await import('meilisearch');
      this.client = new Meilisearch({
        host: process.env.MEILI_HOST ?? 'http://localhost:7700',
        apiKey: process.env.MEILI_MASTER_KEY,
      });
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
      await this.rebuild();
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
      await this.client.index(this.indexName).addDocuments(documents);
    }
  }

  async indexProduct(id: string) {
    if (!this.client) return;
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: { brand: true, variants: true },
      });
      if (!product) {
        await this.client.index(this.indexName).deleteDocument(id);
        return;
      }
      const prices = product.variants.map((variant) =>
        Number(
          variant.pricing_mode === 'linked'
            ? (variant.published_price ?? product.price)
            : (variant.selling_price ?? product.price),
        ),
      );
      await this.client.index(this.indexName).addDocuments([
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
      ]);
    } catch (error) {
      this.client = undefined;
      this.logger.warn(
        `Catalog search update deferred for ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
