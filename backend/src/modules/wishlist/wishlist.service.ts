import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../catalog/products.service';
import { WishlistQueryDto } from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, role: string, query: WishlistQueryDto) {
    this.requireCustomer(role);
    const rows = await this.prisma.wishlistItem.findMany({
      where: { user_id: userId },
      orderBy: [{ added_at: 'desc' }, { id: 'desc' }],
    });
    const products = await this.products.getPublicMany(
      rows.map(({ product_id }) => product_id),
    );
    const byId = new Map(products.map((product) => [product.id, product]));
    const visible = rows.flatMap((row) => {
      const product = byId.get(row.product_id);
      return product ? [this.toResponse(row, product)] : [];
    });
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    return {
      page,
      per_page,
      total: visible.length,
      data: visible.slice((page - 1) * per_page, page * per_page),
    };
  }

  async add(userId: string, role: string, productId: string) {
    this.requireCustomer(role);
    const product = await this.products.getPublic(productId);
    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.wishlistItem.findUnique({
          where: {
            user_id_product_id: { user_id: userId, product_id: productId },
          },
        });
        if (existing) return existing;
        const created = await tx.wishlistItem.create({
          data: { user_id: userId, product_id: productId },
        });
        await this.audit.record(tx, {
          actorId: userId,
          action: 'wishlist_item.create',
          entityType: 'wishlist_item',
          entityId: created.id,
          after: { product_id: productId },
        });
        return created;
      });
      return this.toResponse(item, product);
    } catch (error) {
      if (!this.isUnique(error)) throw error;
      const item = await this.prisma.wishlistItem.findUniqueOrThrow({
        where: {
          user_id_product_id: { user_id: userId, product_id: productId },
        },
      });
      return this.toResponse(item, product);
    }
  }

  async remove(userId: string, role: string, productId: string): Promise<void> {
    this.requireCustomer(role);
    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        user_id_product_id: { user_id: userId, product_id: productId },
      },
    });
    if (!item) throw new NotFoundException('Wishlist item not found');
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.wishlistItem.deleteMany({
        where: { id: item.id, user_id: userId, product_id: productId },
      });
      if (result.count !== 1)
        throw new NotFoundException('Wishlist item not found');
      await this.audit.record(tx, {
        actorId: userId,
        action: 'wishlist_item.delete',
        entityType: 'wishlist_item',
        entityId: item.id,
        before: { product_id: productId },
      });
    });
  }

  private requireCustomer(role: string): void {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
  }

  private toResponse<T>(
    item: { id: string; product_id: string; added_at: Date },
    product: T,
  ) {
    return {
      id: item.id,
      product_id: item.product_id,
      added_at: item.added_at,
      product,
    };
  }

  private isUnique(error: unknown): error is { code: 'P2002' } {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
