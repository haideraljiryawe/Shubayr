import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
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

const productInclude = {
  category: true,
  images: { orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
  variants: { orderBy: { sku: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
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

  async create(input: CreateProductDto, actorId?: string) {
    await this.ensureCategory(input.category_id);
    await this.validateManagedUrls((input.images ?? []).map(({ url }) => url));
    await this.ensureSkusAvailable(input.variants ?? []);
    this.validatePricing(input);

    const { images, variants, ...data } = input;
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...data,
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
          variants: variants?.length
            ? {
                create: variants.map((variant) => ({
                  sku: variant.sku,
                  attributes: variant.attributes as
                    Prisma.InputJsonValue | undefined,
                  price_delta: variant.price_delta ?? 0,
                })),
              }
            : undefined,
        },
        include: productInclude,
      });
      if (actorId && this.hasNegotiationPatch(input)) {
        await this.audit.record(tx, {
          actorId,
          action: 'catalog.negotiation.create',
          entityType: 'product',
          entityId: created.id,
          after: this.negotiationValues(created),
        });
      }
      return created;
    });
    return this.toResponse(product, new Date());
  }

  async update(id: string, input: UpdateProductDto, actorId?: string) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!current) throw new NotFoundException('Product not found');
    if (input.category_id) await this.ensureCategory(input.category_id);
    if (input.variants) await this.ensureSkusAvailable(input.variants, id);
    const mediaUrls = (input.media_operations ?? [])
      .filter((operation) => operation.url)
      .map((operation) => operation.url as string);
    await this.validateManagedUrls(mediaUrls);

    const mergedPricing = mergeProductPricingPatch(current, input);
    this.validatePricing({
      ...mergedPricing,
      is_negotiable: input.is_negotiable ?? current.is_negotiable,
      floor_price:
        input.floor_price === undefined
          ? current.floor_price
          : input.floor_price,
      points_price:
        input.points_price === undefined
          ? current.points_price
          : input.points_price,
    });
    const data = this.productPatchData(input);

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      if (actorId && this.hasNegotiationPatch(input)) {
        await this.audit.record(tx, {
          actorId,
          action: 'catalog.negotiation.update',
          entityType: 'product',
          entityId: id,
          before: this.negotiationValues(current),
          after: this.negotiationValues({ ...current, ...input }),
        });
      }
      if (input.variants) {
        await this.applyVariants(tx, id, current.variants, input.variants);
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

    return this.getAdmin(id);
  }

  async archive(id: string): Promise<void> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { status: 'archived' },
    });
    if (result.count !== 1) throw new NotFoundException('Product not found');
  }

  async availability(id: string, enforcePublicVisibility = false) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        category_id: true,
        variants: { select: { id: true, sku: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (enforcePublicVisibility) {
      const visibleCategoryIds = await this.visibleCategoryIds();
      if (
        product.status !== 'active' ||
        !visibleCategoryIds.has(product.category_id)
      ) {
        throw new NotFoundException('Product not found');
      }
    }
    const [stock, reservations, simpleHolds] = await this.prisma.$transaction([
      this.prisma.batchStock.findMany({
        where: { batch: { product_id: id } },
        select: { quantity: true, batch: { select: { variant_id: true } } },
      }),
      this.prisma.stockReservation.findMany({
        where: { batch: { product_id: id }, status: 'reserved' },
        select: { quantity: true, batch: { select: { variant_id: true } } },
      }),
      this.prisma.simpleStockHold.findMany({
        where: { product_id: id, status: { in: ['held', 'deducted'] } },
        select: { quantity: true, variant_id: true },
      }),
    ]);
    const quantities = new Map<string | null, number>();
    for (const item of stock) {
      const key = item.batch.variant_id;
      quantities.set(key, (quantities.get(key) ?? 0) + item.quantity);
    }
    for (const item of reservations) {
      const key = item.batch.variant_id;
      quantities.set(key, (quantities.get(key) ?? 0) - item.quantity);
    }
    for (const item of simpleHolds) {
      const key = item.variant_id;
      quantities.set(key, (quantities.get(key) ?? 0) - item.quantity);
    }
    const variants = [
      { variant_id: null, sku: 'base' },
      ...product.variants.map((variant) => ({
        variant_id: variant.id,
        sku: variant.sku,
      })),
    ].map((variant) => {
      const available_qty = Math.max(
        0,
        quantities.get(variant.variant_id) ?? 0,
      );
      return { ...variant, available_qty, in_stock: available_qty > 0 };
    });
    const available_qty = variants.reduce(
      (total, variant) => total + variant.available_qty,
      0,
    );
    return {
      product_id: id,
      in_stock: available_qty > 0,
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
        ...(!includeHidden ? { status: 'active' } : {}),
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
    data = data.filter(
      (product) =>
        (query.min_price === undefined ||
          product.effective_price >= query.min_price) &&
        (query.max_price === undefined ||
          product.effective_price <= query.max_price) &&
        (query.on_sale !== true || product.on_sale),
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
    };
  }

  private async toResponse(product: ProductRow, at: Date) {
    const pricing = computeProductPricing(product, at);
    const availability = await this.availability(product.id);
    return {
      ...product,
      price: Number(product.price),
      currency: product.currency_code,
      discount_value:
        product.discount_value === null ? null : Number(product.discount_value),
      floor_price:
        product.floor_price === null ? null : Number(product.floor_price),
      rating_avg: Number(product.rating_avg),
      ...pricing,
      in_stock: availability.in_stock,
      available_qty: availability.available_qty,
      images: product.images.map((image, index) => ({
        id: image.id,
        url: image.url,
        sort_order: image.sort_order,
        is_primary: index === 0,
      })),
      variants: product.variants.map((variant) => ({
        ...variant,
        price_delta: Number(variant.price_delta),
        currency: variant.currency_code,
      })),
    };
  }

  private async ensureCategory(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new UnprocessableEntityException('Category not found');
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
    desired: ProductVariantInputDto[],
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
      const data = {
        sku: variant.sku,
        attributes: variant.attributes as Prisma.InputJsonValue | undefined,
        price_delta: variant.price_delta ?? 0,
      };
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
    const [batches, cartItems, orderItems, invoiceItems, holds] =
      await Promise.all([
        tx.inventoryBatch.findMany({ where, select: { variant_id: true } }),
        tx.cartItem.findMany({ where, select: { variant_id: true } }),
        tx.orderItem.findMany({ where, select: { variant_id: true } }),
        tx.purchaseInvoiceItem.findMany({
          where,
          select: { variant_id: true },
        }),
        tx.simpleStockHold.findMany({ where, select: { variant_id: true } }),
      ]);
    return new Set(
      [...batches, ...cartItems, ...orderItems, ...invoiceItems, ...holds]
        .map(({ variant_id }) => variant_id)
        .filter((id): id is string => id !== null),
    );
  }

  private validatePricing(product: {
    price: number | string | { toNumber(): number };
    is_negotiable?: boolean;
    floor_price?: number | string | { toNumber(): number } | null;
    points_price?: number | null;
    discount_type?: string | null;
    discount_value?: number | string | { toNumber(): number } | null;
    discount_starts_at?: Date | string | null;
    discount_ends_at?: Date | string | null;
  }): void {
    const price = this.decimalNumber(product.price);
    const floor =
      product.floor_price == null
        ? null
        : this.decimalNumber(product.floor_price);
    if (
      !Number.isInteger(price) ||
      (floor !== null && !Number.isInteger(floor))
    ) {
      throw new UnprocessableEntityException(
        'IQD customer prices must use whole dinars',
      );
    }
    if (floor !== null && (floor < 0 || floor > price)) {
      throw new UnprocessableEntityException(
        'floor_price must be between zero and price',
      );
    }
    if (product.is_negotiable && floor === null) {
      throw new UnprocessableEntityException(
        'Negotiable products require floor_price',
      );
    }
    if (
      product.points_price != null &&
      (!Number.isInteger(product.points_price) || product.points_price < 0)
    ) {
      throw new UnprocessableEntityException(
        'points_price must be a non-negative integer',
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

  private hasNegotiationPatch(input: {
    is_negotiable?: boolean;
    floor_price?: number | null;
    points_price?: number | null;
  }) {
    return ['is_negotiable', 'floor_price', 'points_price'].some((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
    );
  }

  private negotiationValues(row: {
    is_negotiable?: boolean;
    floor_price?: number | string | { toNumber(): number } | null;
    points_price?: number | null;
  }) {
    return {
      is_negotiable: row.is_negotiable ?? false,
      floor_price:
        row.floor_price == null ? null : this.decimalNumber(row.floor_price),
      points_price: row.points_price ?? null,
    };
  }

  private productPatchData(input: UpdateProductDto) {
    const fields = [
      'category_id',
      'name_en',
      'name_ar',
      'description',
      'price',
      'discount_type',
      'discount_value',
      'discount_starts_at',
      'discount_ends_at',
      'is_negotiable',
      'floor_price',
      'points_price',
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
    return data;
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
