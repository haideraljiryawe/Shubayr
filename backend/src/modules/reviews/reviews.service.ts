import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateReviewDto,
  EditReviewDto,
  ModerateReviewDto,
  ReviewQueryDto,
} from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
  ) {}

  async publicList(productId: string, query: ReviewQueryDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'active' },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const page = await this.list(
      { product_id: productId, status: 'published' },
      query,
    );
    return {
      ...page,
      data: page.data.map((review) => ({
        id: review.id,
        product_id: review.product_id,
        user_id: review.user_id,
        order_item_id: review.order_item_id,
        rating: review.rating,
        comment: review.comment,
        verified_purchase: review.verified_purchase,
        status: review.status,
        created_at: review.created_at,
        updated_at: review.updated_at,
      })),
    };
  }

  queue(query: ReviewQueryDto) {
    return this.list({ status: query.status ?? 'pending' }, query);
  }

  private async list(
    where: Prisma.ProductReviewWhereInput,
    query: ReviewQueryDto,
  ) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * per_page,
        take: per_page,
      }),
    ]);
    return { page, per_page, total, data };
  }

  async create(
    userId: string,
    role: string,
    productId: string,
    input: CreateReviewDto,
  ) {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockProduct(tx, productId);
        const item = await tx.orderItem.findUnique({
          where: { id: input.order_item_id },
          include: { order: true },
        });
        if (
          !item ||
          item.product_id !== productId ||
          item.order.user_id !== userId
        ) {
          throw new NotFoundException('Purchased order item not found');
        }
        if (item.order.status !== 'delivered') {
          throw new ConflictException('Order must be delivered before review');
        }
        if (item.reviewed)
          throw new ConflictException('Order item already reviewed');
        const review = await tx.productReview.create({
          data: {
            product_id: productId,
            user_id: userId,
            order_item_id: item.id,
            rating: input.rating,
            comment: input.comment ?? null,
            verified_purchase: true,
            status: 'pending',
          },
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { reviewed: true },
        });
        await this.recompute(tx, productId);
        await this.audit.record(tx, {
          actorId: userId,
          action: 'product_review.create',
          entityType: 'product_review',
          entityId: review.id,
          after: {
            order_item_id: item.id,
            rating: review.rating,
            status: review.status,
            verified_purchase: true,
          },
        });
        return review;
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException('Order item already reviewed');
      throw error;
    }
  }

  async edit(userId: string, role: string, id: string, input: EditReviewDto) {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
    if (input.rating === undefined && input.comment === undefined) {
      throw new UnprocessableEntityException('Provide rating or comment');
    }
    const initial = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!initial || initial.user_id !== userId)
      throw new NotFoundException('Review not found');
    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, initial.product_id);
      const current = await tx.productReview.findUniqueOrThrow({
        where: { id },
      });
      if (current.user_id !== userId)
        throw new NotFoundException('Review not found');
      const rating = input.rating ?? current.rating;
      const comment =
        input.comment === undefined ? current.comment : input.comment;
      if (rating === current.rating && comment === current.comment)
        return current;
      const updated = await tx.productReview.update({
        where: { id },
        data: {
          rating,
          comment,
          status: 'pending',
          moderation_reason: null,
          moderated_by: null,
          moderated_at: null,
          updated_at: new Date(),
        },
      });
      await this.recompute(tx, current.product_id);
      await this.audit.record(tx, {
        actorId: userId,
        action: 'product_review.edit',
        entityType: 'product_review',
        entityId: id,
        before: {
          rating: current.rating,
          comment: current.comment,
          status: current.status,
        },
        after: { rating, comment, status: 'pending' },
      });
      return updated;
    });
  }

  async delete(userId: string, role: string, id: string) {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
    const initial = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!initial || initial.user_id !== userId)
      throw new NotFoundException('Review not found');
    await this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, initial.product_id);
      const current = await tx.productReview.findUniqueOrThrow({
        where: { id },
      });
      if (current.user_id !== userId)
        throw new NotFoundException('Review not found');
      await tx.productReview.delete({ where: { id } });
      if (current.order_item_id)
        await tx.orderItem.update({
          where: { id: current.order_item_id },
          data: { reviewed: false },
        });
      await this.recompute(tx, current.product_id);
      await this.audit.record(tx, {
        actorId: userId,
        action: 'product_review.delete',
        entityType: 'product_review',
        entityId: id,
        before: {
          order_item_id: current.order_item_id,
          rating: current.rating,
          status: current.status,
        },
      });
    });
  }

  async moderate(actorId: string, id: string, input: ModerateReviewDto) {
    const initial = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!initial) throw new NotFoundException('Review not found');
    return this.prisma.$transaction(async (tx) => {
      await this.lockProduct(tx, initial.product_id);
      const current = await tx.productReview.findUniqueOrThrow({
        where: { id },
      });
      const status = input.decision === 'publish' ? 'published' : 'rejected';
      if (current.status === status)
        throw new ConflictException('Review already has this status');
      const updated = await tx.productReview.update({
        where: { id },
        data: {
          status,
          moderation_reason: input.reason,
          moderated_by: actorId,
          moderated_at: new Date(),
          updated_at: new Date(),
        },
      });
      await this.recompute(tx, current.product_id);
      await this.audit.record(tx, {
        actorId,
        action: 'product_review.moderate',
        entityType: 'product_review',
        entityId: id,
        before: { status: current.status },
        after: { status, reason: input.reason },
      });
      await this.notifications?.record(
        tx,
        current.user_id,
        'review_moderated',
        'product_review',
        id,
        `${status}:${updated.moderated_at?.getTime()}`,
      );
      return updated;
    });
  }

  private async lockProduct(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Product not found');
  }

  private async recompute(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<
      Array<{ review_count: number; rating_avg: Prisma.Decimal }>
    >`
      SELECT COUNT(*)::integer AS review_count,
             COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS rating_avg
      FROM product_reviews WHERE product_id = ${productId}::uuid AND status = 'published'`;
    const row = rows[0];
    if (!row)
      throw new UnprocessableEntityException(
        'Could not compute product rating',
      );
    await tx.product.update({
      where: { id: productId },
      data: {
        rating_count: row.review_count,
        rating_avg: row.rating_avg,
      },
    });
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
