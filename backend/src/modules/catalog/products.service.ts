import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { ProductQueryDto } from './dto/catalog-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ProductMediaOperationDto,
  ProductVariantInputDto,
} from './dto/product-media.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { computeProductPricing, mergeProductPricingPatch } from './pricing';
import { CatalogSearchService } from './catalog-search.service';
import { BelowCostService } from './below-cost.service';

const productInclude = {
  category: true,
  brand: true,
  images: { orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
  variants: { orderBy: { sku: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

type PreparedVariant = {
  id?: string;
  sku: string;
  attributes?: Prisma.InputJsonValue;
  price_delta: number;
  base_unit: string;
  whole_units_only: boolean;
  selling_price: number | null;
  low_stock_threshold: number | null;
  pricing_mode: 'fixed' | 'linked';
  reference_currency_code: string | null;
  reference_price: number | null;
  published_price: number | null;
  price_approved_at: Date;
  awaiting_rate_id: null;
  updated_at: Date;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly search?: CatalogSearchService,
    private readonly belowCost?: BelowCostService,
  ) {}

  listPublic(query: ProductQueryDto) {
    return this.list(query, false);
  }

  listAdmin(query: ProductQueryDto) {
    return this.list(query, true);
  }

  async getPublic(id: string) {
    const [product] = await this.getPublicMany([id]);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getPublicMany(ids: string[]) {
    if (!ids.length) return [];
    const visibleCategoryIds = await this.visibleCategoryIds();
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        status: 'active',
        published_at: { not: null },
        category_id: { in: [...visibleCategoryIds] },
      },
      include: productInclude,
    });
    const now = new Date();
    return Promise.all(
      products.map((product) => this.toResponse(product, now)),
    );
  }

  async getAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toResponse(product, new Date());
  }

  async create(
    input: CreateProductDto,
    actorId?: string,
    permissions: string[] = [],
  ) {
    await this.ensureCategory(input.category_id);
    await this.ensureBrand(input.brand_id);
    await this.validateManagedUrls((input.images ?? []).map(({ url }) => url));
    await this.ensureSkusAvailable(input.variants ?? []);
    this.validatePricing(input);
    if (!input.variants?.length) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SKU_REQUIRED',
        message: 'A product requires at least one SKU',
        errors: [],
      });
    }
    const preparedVariants = await this.prepareVariants(
      input.variants,
      input.price,
    );
    const belowCostBreaches = actorId
      ? await this.belowCost?.assertAllowed(
          this.prisma,
          actorId,
          permissions,
          preparedVariants.flatMap((variant) =>
            variant.id
              ? [
                  {
                    variant_id: variant.id,
                    sku: variant.sku,
                    price:
                      variant.pricing_mode === 'linked'
                        ? Number(variant.published_price ?? input.price)
                        : Number(variant.selling_price ?? input.price),
                  },
                ]
              : [],
          ),
          {
            reason: input.below_cost_override_reason,
            originatorId: input.below_cost_originator_id,
          },
        )
      : [];

    const {
      images,
      variants: _variants,
      published,
      below_cost_override_reason: _belowCostReason,
      below_cost_originator_id: _belowCostOriginator,
      ...data
    } = input;
    void _variants;
    void _belowCostReason;
    void _belowCostOriginator;
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...data,
          status: data.status ?? 'hidden',
          published_at:
            published || data.status === 'active' ? new Date() : null,
          price_approved_at: new Date(),
          name_en: data.name_en.trim(),
          name_ar: data.name_ar.trim(),
          images: images?.length
            ? {
                create: images.map(({ url }, sort_order) => ({
                  url,
                  sort_order,
                })),
              }
            : undefined,
          variants: preparedVariants.length
            ? {
                create: preparedVariants,
              }
            : undefined,
        },
        include: productInclude,
      });
      if (actorId) {
        await this.audit.record(tx, {
          actorId,
          action: 'catalog.product.create',
          entityType: 'product',
          entityId: created.id,
          after: { status: created.status, published_at: created.published_at },
        });
      }
      if (actorId && belowCostBreaches?.length) {
        await this.audit.record(tx, {
          actorId,
          action: 'prices.below_cost.override',
          entityType: 'product',
          entityId: created.id,
          after: { variants: belowCostBreaches },
          reason: input.below_cost_override_reason ?? undefined,
        });
      }
      return created;
    });
    await this.search?.indexProduct(product.id);
    return this.toResponse(product, new Date());
  }

  async update(
    id: string,
    input: UpdateProductDto,
    actorId?: string,
    permissions: string[] = [],
  ) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!current) throw new NotFoundException('Product not found');
    if (input.category_id) await this.ensureCategory(input.category_id);
    if (input.brand_id !== undefined) await this.ensureBrand(input.brand_id);
    if (input.variants) await this.ensureSkusAvailable(input.variants, id);
    const mediaUrls = (input.media_operations ?? [])
      .filter((operation) => operation.url)
      .map((operation) => operation.url as string);
    await this.validateManagedUrls(mediaUrls);

    const mergedPricing = mergeProductPricingPatch(current, input);
    this.validatePricing(mergedPricing);
    const data = this.productPatchData(input);
    const productPrice = input.price ?? Number(current.price);
    const preparedVariants = input.variants
      ? await this.prepareVariants(input.variants, productPrice)
      : undefined;
    const belowCostBreaches =
      actorId && preparedVariants
        ? await this.belowCost?.assertAllowed(
            this.prisma,
            actorId,
            permissions,
            preparedVariants.flatMap((variant) => {
              const existing = current.variants.find(
                (entry) => entry.id === variant.id || entry.sku === variant.sku,
              );
              return existing
                ? [
                    {
                      variant_id: existing.id,
                      sku: variant.sku,
                      price:
                        variant.pricing_mode === 'linked'
                          ? Number(variant.published_price ?? productPrice)
                          : Number(variant.selling_price ?? productPrice),
                    },
                  ]
                : [];
            }),
            {
              reason: input.below_cost_override_reason,
              originatorId: input.below_cost_originator_id,
            },
          )
        : [];
    if (input.published === true || input.status === 'active') {
      const publishableVariants = preparedVariants ?? current.variants;
      const productPriceApproved =
        input.price !== undefined || current.price_approved_at !== null;
      const allSkuPricesApproved = publishableVariants.every(
        (variant) =>
          variant.price_approved_at !== null &&
          (variant.pricing_mode !== 'linked' ||
            variant.published_price !== null),
      );
      if (
        !publishableVariants.length ||
        !productPriceApproved ||
        !allSkuPricesApproved
      ) {
        throw new UnprocessableEntityException({
          status: 422,
          code: 'PRODUCT_NOT_READY',
          message:
            'A product and every SKU require an approved selling price before publishing',
          errors: [],
        });
      }
      Object.assign(data, { published_at: new Date(), status: 'active' });
    } else if (input.published === false) {
      Object.assign(data, { published_at: null });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { ...data, search_sync_required: true },
      });
      if (actorId) {
        await this.audit.record(tx, {
          actorId,
          action: 'catalog.product.update',
          entityType: 'product',
          entityId: id,
          before: {
            status: current.status,
            published_at: current.published_at,
          },
          after: {
            status: input.status ?? current.status,
            published: input.published,
          },
        });
      }
      if (actorId && belowCostBreaches?.length) {
        await this.audit.record(tx, {
          actorId,
          action: 'prices.below_cost.override',
          entityType: 'product',
          entityId: id,
          after: { variants: belowCostBreaches },
          reason: input.below_cost_override_reason ?? undefined,
        });
      }
      if (preparedVariants) {
        await this.applyVariants(tx, id, current.variants, preparedVariants);
      }
      if (input.media_operations) {
        await this.applyMediaOperations(
          tx,
          id,
          current.images,
          input.media_operations,
        );
      }
    });

    await this.search?.indexProduct(id);
    return this.getAdmin(id);
  }

  async archive(id: string): Promise<void> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { status: 'archived', search_sync_required: true },
    });
    if (result.count !== 1) throw new NotFoundException('Product not found');
    await this.search?.indexProduct(id);
  }

  async availability(id: string, enforcePublicVisibility = false) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        published_at: true,
        category_id: true,
        variants: {
          select: {
            id: true,
            sku: true,
            low_stock_threshold: true,
            base_unit: true,
            whole_units_only: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (enforcePublicVisibility) {
      const visibleCategoryIds = await this.visibleCategoryIds();
      if (
        product.status !== 'active' ||
        !product.published_at ||
        !visibleCategoryIds.has(product.category_id)
      ) {
        throw new NotFoundException('Product not found');
      }
    }
    const stock = await this.prisma.batchStock.findMany({
      where: {
        batch: {
          product_id: id,
          OR: [{ expiry_date: null }, { expiry_date: { gte: new Date() } }],
        },
        location: {
          is_active: true,
          is_sellable: true,
          warehouse: { is_active: true },
        },
      },
      select: {
        quantity: true,
        reserved: true,
        batch: { select: { variant_id: true } },
      },
    });
    const quantities = new Map<string, number>();
    for (const item of stock) {
      const key = item.batch.variant_id;
      quantities.set(
        key,
        (quantities.get(key) ?? 0) +
          Number(item.quantity) -
          Number(item.reserved ?? 0),
      );
    }
    const defaultThreshold = await this.defaultLowStockThreshold();
    const variants = product.variants.map((stored) => {
      const variant = { variant_id: stored.id, sku: stored.sku };
      const available_qty = Math.max(
        0,
        quantities.get(variant.variant_id) ?? 0,
      );
      const threshold =
        stored.low_stock_threshold === null
          ? defaultThreshold
          : Number(stored.low_stock_threshold);
      const availability =
        available_qty === 0
          ? 'out_of_stock'
          : available_qty <= threshold
            ? 'low_stock'
            : 'in_stock';
      return {
        ...variant,
        base_unit: stored.base_unit,
        whole_units_only: stored.whole_units_only,
        low_stock_threshold: threshold,
        available_qty,
        availability,
        in_stock: available_qty > 0,
      };
    });
    const available_qty = variants.reduce(
      (total, variant) => total + variant.available_qty,
      0,
    );
    return {
      product_id: id,
      in_stock: available_qty > 0,
      availability: variants.some(
        (variant) => variant.availability === 'in_stock',
      )
        ? 'in_stock'
        : variants.some((variant) => variant.availability === 'low_stock')
          ? 'low_stock'
          : 'out_of_stock',
      available_qty,
      variants,
    };
  }

  private async list(query: ProductQueryDto, includeHidden: boolean) {
    if (
      query.min_price !== undefined &&
      query.max_price !== undefined &&
      query.min_price > query.max_price
    ) {
      throw new UnprocessableEntityException(
        'min_price must not exceed max_price',
      );
    }
    const visibleCategoryIds = includeHidden
      ? undefined
      : await this.visibleCategoryIds();
    const q = query.q?.trim();
    const rows = await this.prisma.product.findMany({
      where: {
        ...(!includeHidden
          ? { status: 'active', published_at: { not: null } }
          : {}),
        ...this.categoryFilter(query.category_id, visibleCategoryIds),
        ...(q
          ? {
              OR: [
                { name_en: { contains: q, mode: 'insensitive' } },
                { name_ar: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: productInclude,
    });
    const now = new Date();
    let data = await Promise.all(rows.map((row) => this.toResponse(row, now)));
    const filteredWithoutBrands = data.filter(
      (product) =>
        (query.min_price === undefined ||
          product.effective_price >= query.min_price) &&
        (query.max_price === undefined ||
          product.effective_price <= query.max_price) &&
        (query.on_sale !== true || product.on_sale),
    );
    const brandCounts = new Map<string, number>();
    for (const product of filteredWithoutBrands) {
      if (product.brand_id) {
        brandCounts.set(
          product.brand_id,
          (brandCounts.get(product.brand_id) ?? 0) + 1,
        );
      }
    }
    data = filteredWithoutBrands.filter(
      (product) =>
        !query.brand_id?.length ||
        (product.brand_id && query.brand_id.includes(product.brand_id)),
    );
    const sort = query.sort ?? 'newest';
    data.sort((left, right) => {
      if (sort === 'price_asc')
        return left.effective_price - right.effective_price;
      if (sort === 'price_desc')
        return right.effective_price - left.effective_price;
      if (sort === 'rating') return right.rating_avg - left.rating_avg;
      return right.created_at.getTime() - left.created_at.getTime();
    });
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const total = data.length;
    return {
      page,
      per_page,
      total,
      data: data.slice((page - 1) * per_page, page * per_page),
      facets: {
        brands: [...brandCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([brand_id, count]) => ({ brand_id, count })),
      },
    };
  }

  private async toResponse(product: ProductRow, at: Date) {
    const productPricing = computeProductPricing(product, at);
    const availability = await this.availability(product.id);
    const byVariant = new Map(
      availability.variants.map((entry) => [entry.variant_id, entry]),
    );
    const variants = product.variants.map((variant) => {
      const {
        product_id: _productId,
        currency_code: _currencyCode,
        updated_at: _updatedAt,
        ...publicVariant
      } = variant;
      void _productId;
      void _currencyCode;
      void _updatedAt;
      const regular = this.variantRegularPrice(product, variant);
      const pricing = computeProductPricing({ ...product, price: regular }, at);
      const stock = byVariant.get(variant.id);
      return {
        ...publicVariant,
        price_delta: regular - Number(product.price),
        selling_price:
          variant.selling_price === null ? null : Number(variant.selling_price),
        low_stock_threshold:
          variant.low_stock_threshold === null
            ? null
            : Number(variant.low_stock_threshold),
        reference_price:
          variant.reference_price === null
            ? null
            : Number(variant.reference_price),
        published_price:
          variant.published_price === null
            ? null
            : Number(variant.published_price),
        currency: variant.currency_code,
        ...pricing,
        ...(stock
          ? {
              sku: stock.sku,
              base_unit: stock.base_unit,
              whole_units_only: stock.whole_units_only,
              low_stock_threshold: stock.low_stock_threshold,
              available_qty: stock.available_qty,
              availability: stock.availability,
              in_stock: stock.in_stock,
            }
          : {}),
      };
    });
    const effectivePrices = variants.map((variant) => variant.effective_price);
    const {
      currency_code: _currencyCode,
      category: _category,
      search_sync_required: _searchSyncRequired,
      search_synced_at: _searchSyncedAt,
      ...publicProduct
    } = product;
    void _currencyCode;
    void _category;
    void _searchSyncRequired;
    void _searchSyncedAt;
    return {
      ...publicProduct,
      price: Number(product.price),
      currency: product.currency_code,
      discount_value:
        product.discount_value === null ? null : Number(product.discount_value),
      rating_avg: Number(product.rating_avg),
      ...productPricing,
      effective_price: effectivePrices.length
        ? Math.min(...effectivePrices)
        : productPricing.effective_price,
      brand: product.brand,
      in_stock: availability.in_stock,
      availability: availability.availability,
      available_qty: availability.available_qty,
      images: product.images.map((image, index) => ({
        id: image.id,
        url: image.url,
        sort_order: image.sort_order,
        is_primary: index === 0,
      })),
      variants,
    };
  }

  private async ensureCategory(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, parent_id: true },
    });
    if (!category) throw new UnprocessableEntityException('Category not found');
    if (!category.parent_id) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'PRODUCT_REQUIRES_SUBCATEGORY',
        message: 'Products must belong to a subcategory',
        errors: [],
      });
    }
  }

  private async ensureBrand(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!brand) throw new UnprocessableEntityException('Brand not found');
  }

  private async validateManagedUrls(urls: string[]): Promise<void> {
    await Promise.all(
      [...new Set(urls)].map((url) => this.media.requireManagedUrl(url)),
    );
  }

  private async ensureSkusAvailable(
    variants: ProductVariantInputDto[],
    productId?: string,
  ): Promise<void> {
    if (
      variants.some(
        ({ price_delta: priceDelta }) =>
          priceDelta !== undefined && !Number.isInteger(priceDelta),
      )
    ) {
      throw new UnprocessableEntityException(
        'IQD variant price deltas must use whole dinars',
      );
    }
    const skus = variants.map(({ sku }) => sku);
    if (new Set(skus).size !== skus.length) {
      throw new ConflictException('Variant SKUs must be unique');
    }
    if (!skus.length) return;
    const match = await this.prisma.productVariant.findFirst({
      where: {
        sku: { in: skus },
        ...(productId ? { product_id: { not: productId } } : {}),
      },
      select: { sku: true },
    });
    if (match)
      throw new ConflictException(`Variant SKU already exists: ${match.sku}`);
  }

  private async prepareVariants(
    variants: ProductVariantInputDto[],
    productPrice: number,
  ): Promise<PreparedVariant[]> {
    const now = new Date();
    const rateCache = new Map<string, { id: string; rate: Prisma.Decimal }>();
    const [rounding, baseCurrency] = await Promise.all([
      this.saleRoundingMultiple(),
      this.prisma.currency.findFirst({ where: { is_base: true } }),
    ]);
    if (!baseCurrency)
      throw new ConflictException('No base currency is configured');
    const result: PreparedVariant[] = [];
    for (const variant of variants) {
      const mode = variant.pricing_mode ?? 'fixed';
      const baseUnit = variant.base_unit?.trim() || 'piece';
      const wholeUnitsOnly = variant.whole_units_only ?? baseUnit === 'piece';
      if (mode === 'fixed') {
        if (
          variant.reference_currency_code ||
          variant.reference_price != null
        ) {
          throw new UnprocessableEntityException(
            'Fixed-price SKUs cannot define a foreign reference price',
          );
        }
        const override =
          variant.selling_price ??
          (variant.price_delta == null
            ? null
            : productPrice + variant.price_delta);
        if (
          override !== null &&
          (!Number.isInteger(override) || override < 0)
        ) {
          throw new UnprocessableEntityException(
            'IQD selling prices must use whole dinars',
          );
        }
        result.push({
          id: variant.id,
          sku: variant.sku,
          attributes: variant.attributes as Prisma.InputJsonValue | undefined,
          price_delta: override === null ? 0 : override - productPrice,
          base_unit: baseUnit,
          whole_units_only: wholeUnitsOnly,
          selling_price: override,
          low_stock_threshold: variant.low_stock_threshold ?? null,
          pricing_mode: mode,
          reference_currency_code: null,
          reference_price: null,
          published_price: null,
          price_approved_at: now,
          awaiting_rate_id: null,
          updated_at: now,
        });
        continue;
      }
      const currencyCode = variant.reference_currency_code?.toUpperCase();
      if (
        !currencyCode ||
        currencyCode === baseCurrency.code ||
        !variant.reference_price ||
        variant.reference_price <= 0
      ) {
        throw new UnprocessableEntityException(
          'Linked-price SKUs require a positive foreign reference price and currency',
        );
      }
      let rate = rateCache.get(currencyCode);
      if (!rate) {
        const stored = await this.prisma.exchangeRate.findFirst({
          where: { currency_code: currencyCode, effective_at: { lte: now } },
          orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
          select: { id: true, rate: true },
        });
        if (!stored) {
          throw new UnprocessableEntityException({
            status: 422,
            code: 'PRICING_RATE_REQUIRED',
            message: `No pricing exchange rate exists for ${currencyCode}`,
            errors: [],
          });
        }
        rate = stored;
        rateCache.set(currencyCode, stored);
      }
      const published = this.roundLinkedPrice(
        new Prisma.Decimal(variant.reference_price).mul(rate.rate),
        rounding,
        baseCurrency.display_precision,
      );
      result.push({
        id: variant.id,
        sku: variant.sku,
        attributes: variant.attributes as Prisma.InputJsonValue | undefined,
        price_delta: 0,
        base_unit: baseUnit,
        whole_units_only: wholeUnitsOnly,
        selling_price: null,
        low_stock_threshold: variant.low_stock_threshold ?? null,
        pricing_mode: mode,
        reference_currency_code: currencyCode,
        reference_price: variant.reference_price,
        published_price: published,
        price_approved_at: now,
        awaiting_rate_id: null,
        updated_at: now,
      });
    }
    return result;
  }

  /**
   * Reconciles a product's variant set in place.
   *
   * This used to delete every variant and recreate the supplied set, which
   * handed each surviving variant a brand new id on every product update.
   * Inventory batches, cart lines, order lines, purchase invoice lines and
   * stock holds all reference variants by id, so the rebuild either orphaned
   * that history or — because those foreign keys are ON DELETE NO ACTION —
   * failed outright and surfaced as a 500.
   *
   * Variants are matched on the supplied `id` when present and otherwise on
   * the globally unique `sku`, so an edit keeps the existing row.
   */
  private async applyVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    existing: Array<{ id: string; sku: string }>,
    desired: PreparedVariant[],
  ): Promise<void> {
    const byId = new Map(existing.map((variant) => [variant.id, variant]));
    const bySku = new Map(existing.map((variant) => [variant.sku, variant]));
    const kept = new Set<string>();

    for (const variant of desired) {
      const match = variant.id ? byId.get(variant.id) : bySku.get(variant.sku);
      if (variant.id && !match) {
        throw new UnprocessableEntityException(
          `Variant ${variant.id} does not belong to this product`,
        );
      }
      const { id: _id, ...data } = variant;
      void _id;
      if (match) {
        kept.add(match.id);
        await tx.productVariant.update({ where: { id: match.id }, data });
        continue;
      }
      const created = await tx.productVariant.create({
        data: { product_id: productId, ...data },
      });
      kept.add(created.id);
    }

    const removed = existing.filter((variant) => !kept.has(variant.id));
    if (!removed.length) return;
    const referenced = await this.referencedVariantIds(
      tx,
      removed.map(({ id }) => id),
    );
    if (referenced.size) {
      // Deleting these would violate an ON DELETE NO ACTION foreign key and
      // destroy the immutable history that points at them, so refuse the
      // removal with the unified 422 rather than a database-level 500.
      const skus = removed
        .filter(({ id }) => referenced.has(id))
        .map(({ sku }) => sku)
        .join(', ');
      throw new UnprocessableEntityException(
        `Cannot remove variant(s) referenced by inventory or order history: ${skus}`,
      );
    }
    await tx.productVariant.deleteMany({
      where: { id: { in: removed.map(({ id }) => id) } },
    });
  }

  /** Variant ids still pointed at by stock, cart, purchasing or order rows. */
  private async referencedVariantIds(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<Set<string>> {
    const where = { variant_id: { in: ids } } as const;
    const [batches, cartItems, orderItems, invoiceItems] = await Promise.all([
      tx.inventoryBatch.findMany({ where, select: { variant_id: true } }),
      tx.cartItem.findMany({ where, select: { variant_id: true } }),
      tx.orderItem.findMany({ where, select: { variant_id: true } }),
      tx.purchaseInvoiceItem.findMany({
        where,
        select: { variant_id: true },
      }),
    ]);
    return new Set(
      [...batches, ...cartItems, ...orderItems, ...invoiceItems]
        .map(({ variant_id }) => variant_id)
        .filter((id): id is string => id !== null),
    );
  }

  private validatePricing(product: {
    price: number | string | { toNumber(): number };
    discount_type?: string | null;
    discount_value?: number | string | { toNumber(): number } | null;
    discount_starts_at?: Date | string | null;
    discount_ends_at?: Date | string | null;
  }): void {
    const price = this.decimalNumber(product.price);
    if (!Number.isInteger(price)) {
      throw new UnprocessableEntityException(
        'IQD customer prices must use whole dinars',
      );
    }
    const value =
      product.discount_value === null || product.discount_value === undefined
        ? null
        : this.decimalNumber(product.discount_value);
    if (!product.discount_type) {
      if (
        value !== null ||
        product.discount_starts_at != null ||
        product.discount_ends_at != null
      ) {
        throw new UnprocessableEntityException(
          'Discount value and schedule require discount_type',
        );
      }
      return;
    }
    if (value === null || value <= 0) {
      throw new UnprocessableEntityException(
        'discount_value must be greater than zero',
      );
    }
    if (product.discount_type === 'percentage' && value > 100) {
      throw new UnprocessableEntityException(
        'Percentage discount cannot exceed 100',
      );
    }
    if (product.discount_type === 'amount' && value >= price) {
      throw new UnprocessableEntityException(
        'Amount discount must be less than price',
      );
    }
    if (product.discount_type === 'amount' && !Number.isInteger(value)) {
      throw new UnprocessableEntityException(
        'IQD amount discounts must use whole dinars',
      );
    }
    const starts = product.discount_starts_at
      ? new Date(product.discount_starts_at)
      : null;
    const ends = product.discount_ends_at
      ? new Date(product.discount_ends_at)
      : null;
    if (starts && ends && ends <= starts) {
      throw new UnprocessableEntityException(
        'discount_ends_at must be after discount_starts_at',
      );
    }
  }

  private decimalNumber(
    value: number | string | { toNumber(): number },
  ): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return value.toNumber();
  }

  private productPatchData(input: UpdateProductDto) {
    const fields = [
      'category_id',
      'brand_id',
      'name_en',
      'name_ar',
      'description',
      'price',
      'discount_type',
      'discount_value',
      'discount_starts_at',
      'discount_ends_at',
      'tracks_expiry',
      'status',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        data[field] = input[field];
      }
    }
    if (input.name_en !== undefined) data.name_en = input.name_en.trim();
    if (input.name_ar !== undefined) data.name_ar = input.name_ar.trim();
    if (input.discount_type === null) {
      data.discount_value = null;
      data.discount_starts_at = null;
      data.discount_ends_at = null;
    }
    if (input.price !== undefined) data.price_approved_at = new Date();
    return data;
  }

  private variantRegularPrice(
    product: { price: Prisma.Decimal },
    variant: {
      pricing_mode: string;
      selling_price: Prisma.Decimal | null;
      published_price: Prisma.Decimal | null;
    },
  ): number {
    if (variant.pricing_mode === 'linked') {
      if (variant.published_price === null) return Number(product.price);
      return Number(variant.published_price);
    }
    return variant.selling_price === null
      ? Number(product.price)
      : Number(variant.selling_price);
  }

  private async defaultLowStockThreshold(): Promise<number> {
    // Keeps isolated service consumers and older test doubles compatible while
    // the real Prisma client always exposes the settings delegate.
    if (!this.prisma.storeSetting) return 0;
    const setting = await this.prisma.storeSetting.findUnique({
      where: { key: 'default_low_stock_threshold' },
    });
    const parsed = Number(setting?.value ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private async saleRoundingMultiple(): Promise<Prisma.Decimal> {
    const setting = await this.prisma.storeSetting.findUnique({
      where: { key: 'sale_rounding_multiple' },
    });
    const value = new Prisma.Decimal(setting?.value || 0);
    return value.gte(0) ? value : new Prisma.Decimal(0);
  }

  private roundLinkedPrice(
    value: Prisma.Decimal,
    multiple: Prisma.Decimal,
    precision: number,
  ): number {
    const rounded = multiple.gt(0)
      ? value.div(multiple).ceil().mul(multiple)
      : value.toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
    return Number(rounded);
  }

  private async applyMediaOperations(
    tx: Prisma.TransactionClient,
    productId: string,
    current: ProductRow['images'],
    operations: ProductMediaOperationDto[],
  ): Promise<void> {
    const list: Array<{ id: string | null; url: string }> = current.map(
      ({ id, url }) => ({ id, url }),
    );
    for (const operation of operations) {
      if (operation.op === 'add') {
        if (
          operation.url === undefined ||
          operation.position === undefined ||
          operation.position > list.length
        ) {
          throw new UnprocessableEntityException('Invalid add media operation');
        }
        list.splice(operation.position, 0, { id: null, url: operation.url });
        continue;
      }
      const index = list.findIndex(({ id }) => id === operation.image_id);
      if (index < 0) {
        throw new UnprocessableEntityException('Product image was not found');
      }
      if (operation.op === 'remove') list.splice(index, 1);
      if (operation.op === 'replace') {
        if (!operation.url)
          throw new UnprocessableEntityException('Replacement URL is required');
        list[index].url = operation.url;
      }
      if (operation.op === 'move') {
        if (
          operation.position === undefined ||
          operation.position >= list.length
        ) {
          throw new UnprocessableEntityException('Invalid image move position');
        }
        const [item] = list.splice(index, 1);
        list.splice(operation.position, 0, item);
      }
    }

    await tx.productImage.updateMany({
      where: { product_id: productId },
      data: { sort_order: { increment: 100_000 } },
    });
    const kept = list.flatMap(({ id }) => (id ? [id] : []));
    await tx.productImage.deleteMany({
      where: {
        product_id: productId,
        ...(kept.length ? { id: { notIn: kept } } : {}),
      },
    });
    for (const [sort_order, image] of list.entries()) {
      if (image.id) {
        await tx.productImage.update({
          where: { id: image.id },
          data: { url: image.url, sort_order },
        });
      } else {
        await tx.productImage.create({
          data: { product_id: productId, url: image.url, sort_order },
        });
      }
    }
  }

  /**
   * Narrows a product query to one category without losing the effective
   * visibility filter. Both used to be spread into the same `where` object
   * under the same `category_id` key, so an explicit ?category_id= silently
   * replaced the visibility filter and exposed hidden categories publicly.
   */
  private categoryFilter(
    requested: string | undefined,
    visible: Set<string> | undefined,
  ) {
    if (!requested) {
      return visible ? { category_id: { in: [...visible] } } : {};
    }
    // A public read of a hidden category — or of one under a hidden ancestor
    // — reports it as empty rather than leaking its products.
    if (visible && !visible.has(requested)) return { category_id: { in: [] } };
    return { category_id: requested };
  }

  /**
   * Categories that are visible in their own right AND have no hidden
   * ancestor: hiding a parent hides its whole subtree from public reads.
   */
  private async visibleCategoryIds(): Promise<Set<string>> {
    const rows = await this.prisma.category.findMany({
      select: { id: true, parent_id: true, is_visible: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return new Set(
      rows
        .filter((row) => {
          let current: (typeof rows)[number] | undefined = row;
          const visited = new Set<string>();
          while (current) {
            if (!current.is_visible || visited.has(current.id)) return false;
            visited.add(current.id);
            current = current.parent_id
              ? byId.get(current.parent_id)
              : undefined;
          }
          return true;
        })
        .map(({ id }) => id),
    );
  }
}
