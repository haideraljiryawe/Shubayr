import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import { businessDate } from '../finance/business-date';
import {
  calculateLineTotal,
  minorUnitsToMoney,
  moneyToMinorUnits,
} from '../catalog/pricing';
import {
  InspectReturnDto,
  RequestReturnDto,
  ReturnQueryDto,
} from './dto/return.dto';

const returnInclude = {
  items: true,
  refund: true,
} satisfies Prisma.ReturnInclude;
type ReturnRow = Prisma.ReturnGetPayload<{ include: typeof returnInclude }>;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly notifications?: NotificationsService,
  ) {}

  listOwned(userId: string, query: ReturnQueryDto) {
    return this.list({ user_id: userId }, query);
  }

  queue(query: ReturnQueryDto) {
    return this.list({}, query);
  }

  private async list(scope: Prisma.ReturnWhereInput, query: ReturnQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.ReturnWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.return.count({ where }),
      this.prisma.return.findMany({
        where,
        include: returnInclude,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.present(row)),
    };
  }

  async request(userId: string, role: string, input: RequestReturnDto) {
    if (role !== 'customer')
      throw new ForbiddenException('Customer account required');
    const documentDate = businessDate();
    const id = await this.prisma.$transaction(async (tx) => {
      const initial = await tx.order.findUnique({
        where: { id: input.order_id },
      });
      if (!initial || initial.user_id !== userId)
        throw new NotFoundException('Order not found');
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${input.order_id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: input.order_id },
        include: {
          items: {
            include: {
              variant: { select: { whole_units_only: true } },
            },
          },
        },
      });
      if (!order || order.status !== 'delivered') {
        throw new ConflictException('Only delivered orders can be returned');
      }
      if (!input.items.length)
        throw new UnprocessableEntityException('Return requires items');
      const ids = input.items.map((item) => item.order_item_id);
      if (new Set(ids).size !== ids.length) {
        throw new UnprocessableEntityException(
          'Each order item may appear once',
        );
      }
      const previous = await tx.returnItem.findMany({
        where: { order_item_id: { in: ids } },
        include: { return: { select: { status: true } } },
      });
      const orderItems = new Map(order.items.map((item) => [item.id, item]));
      let expectedMinor = 0n;
      const lines = input.items.map((entry) => {
        const item = orderItems.get(entry.order_item_id);
        if (!item)
          throw new UnprocessableEntityException('Item is not on this order');
        this.requireQuantityUnit(entry.quantity, item.variant.whole_units_only);
        const reserved = previous
          .filter((prior) => prior.order_item_id === item.id)
          .reduce(
            (sum, prior) =>
              sum +
              Number(
                prior.return.status === 'requested'
                  ? prior.quantity
                  : prior.approved_quantity,
              ),
            0,
          );
        if (entry.quantity > Number(item.quantity) - reserved) {
          throw new UnprocessableEntityException(
            'Return quantity exceeds eligible quantity',
          );
        }
        expectedMinor += moneyToMinorUnits(
          calculateLineTotal(item.unit_price, entry.quantity),
        );
        return {
          order_item_id: item.id,
          quantity: entry.quantity,
          customer_reason: entry.reason,
          unit_price: item.unit_price,
        };
      });
      const created = await tx.return.create({
        data: {
          order_id: order.id,
          user_id: userId,
          reason: input.reason ?? null,
          status: 'requested',
          document_date: documentDate,
          accounting_date: documentDate,
          expected_refund: minorUnitsToMoney(expectedMinor),
          items: { create: lines },
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'return.request',
        entityType: 'return',
        entityId: created.id,
        after: {
          order_id: order.id,
          item_count: lines.length,
          expected_refund: minorUnitsToMoney(expectedMinor),
        },
      });
      await this.notifications?.record(
        tx,
        userId,
        'return_update',
        'return',
        created.id,
        'requested',
      );
      return created.id;
    });
    return this.get(id);
  }

  async inspect(actorId: string, id: string, input: InspectReturnDto) {
    await this.prisma.$transaction(
      async (tx) => {
        const initial = await tx.return.findUnique({ where: { id } });
        if (!initial) throw new NotFoundException('Return not found');
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.order_id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM returns WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.return.findUnique({
          where: { id },
          include: {
            items: {
              include: {
                order_item: {
                  include: {
                    variant: { select: { whole_units_only: true } },
                  },
                },
              },
            },
          },
        });
        if (!current) throw new NotFoundException('Return not found');
        if (current.status !== 'requested')
          throw new ConflictException('Return has already been reviewed');
        assertDifferentActor(
          actorId,
          current.user_id,
          'The return requester cannot approve or reject their own request',
        );

        const decisions = new Map(
          (input.items ?? []).map((item) => [item.return_item_id, item]),
        );
        if (input.decision === 'reject' && (input.items?.length ?? 0) !== 0) {
          throw new UnprocessableEntityException(
            'Whole rejection must not include line decisions',
          );
        }
        if (
          input.decision === 'approve' &&
          (decisions.size !== current.items.length ||
            (input.items?.length ?? 0) !== current.items.length ||
            current.items.some((item) => !decisions.has(item.id)))
        ) {
          throw new UnprocessableEntityException(
            'Review every requested line exactly once',
          );
        }
        let refundMinor = 0n;
        let approvedTotal = 0;
        const requestedTotal = current.items.reduce(
          (sum, item) => sum + Number(item.quantity),
          0,
        );
        for (const item of current.items) {
          const decision =
            input.decision === 'approve' ? decisions.get(item.id) : undefined;
          const approved = decision?.approved_quantity ?? 0;
          this.requireQuantityUnit(
            approved,
            item.order_item.variant.whole_units_only,
          );
          if (approved > Number(item.quantity)) {
            throw new UnprocessableEntityException(
              'Approved quantity exceeds request',
            );
          }
          if (approved > 0 && !decision?.condition) {
            throw new UnprocessableEntityException(
              'Approved lines require a condition',
            );
          }
          const condition = approved > 0 ? decision!.condition! : null;
          const restock = condition === 'sellable';
          let batchId: string | null = null;
          if (restock) {
            batchId = await this.inventory.returnToStock(
              tx,
              current.id,
              item.id,
              item.order_item.id,
              approved,
              actorId,
            );
            const movements = await tx.stockMovement.findMany({
              where: { return_item_id: item.id, type: 'return_in' },
            });
            for (const movement of movements) {
              await this.audit.record(tx, {
                actorId,
                action: 'return.restock',
                entityType: 'stock_movement',
                entityId: movement.id,
                after: {
                  return_item_id: item.id,
                  batch_id: movement.batch_id,
                  location_id: movement.to_location,
                  quantity: movement.quantity,
                  unit_cost_iqd: movement.unit_cost_iqd,
                },
              });
            }
          }
          await tx.returnItem.update({
            where: { id: item.id },
            data: {
              approved_quantity: approved,
              condition,
              restock,
              batch_id: batchId,
            },
          });
          await this.audit.record(tx, {
            actorId,
            action: 'return.disposition',
            entityType: 'return_item',
            entityId: item.id,
            after: {
              requested_quantity: item.quantity,
              approved_quantity: approved,
              condition: condition ?? 'rejected',
              restock,
            },
          });
          approvedTotal += approved;
          refundMinor += moneyToMinorUnits(
            calculateLineTotal(item.unit_price, approved),
          );
        }
        const status =
          approvedTotal === 0
            ? 'rejected'
            : approvedTotal === requestedTotal
              ? 'approved'
              : 'partially_approved';
        const refundAmount = minorUnitsToMoney(refundMinor);
        await tx.return.update({
          where: { id },
          data: {
            status,
            refund_amount: refundAmount,
            reviewed_by: actorId,
            reviewed_at: new Date(),
          },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'return.review',
          entityType: 'return',
          entityId: id,
          before: { status: current.status },
          after: { status, refund_amount: refundAmount },
        });
        await this.notifications?.record(
          tx,
          current.user_id,
          'return_update',
          'return',
          id,
          status,
        );
        if (approvedTotal > 0) {
          const ledger = await tx.refundLedgerEntry.create({
            data: {
              order_id: current.order_id,
              return_id: id,
              amount: refundAmount,
              status: 'obligation',
              reason: `COD return ${id}: recorded refund obligation; no payment gateway reversal`,
              created_by: actorId,
            },
          });
          await this.audit.record(tx, {
            actorId,
            action: 'refund.obligation',
            entityType: 'refund_ledger',
            entityId: ledger.id,
            after: {
              return_id: id,
              amount: refundAmount,
              status: 'obligation',
            },
          });
        }
      },
      { timeout: 15_000 },
    );
    return this.get(id);
  }

  async complete(actorId: string, id: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const initial = await tx.return.findUnique({ where: { id } });
        if (!initial) throw new NotFoundException('Return not found');
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.order_id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM returns WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.return.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Return not found');
        if (
          !['approved', 'partially_approved', 'rejected'].includes(
            current.status,
          )
        ) {
          throw new ConflictException(
            'Return must be reviewed before completion',
          );
        }
        await tx.return.update({
          where: { id },
          data: { status: 'completed', completed_at: new Date() },
        });
        const order = await tx.order.findUniqueOrThrow({
          where: { id: current.order_id },
          include: { items: true },
        });
        const approved = await tx.returnItem.findMany({
          where: {
            return: { order_id: order.id },
            approved_quantity: { gt: 0 },
          },
          select: { order_item_id: true, approved_quantity: true },
        });
        const returned = new Map<string, number>();
        for (const item of approved) {
          returned.set(
            item.order_item_id,
            (returned.get(item.order_item_id) ?? 0) +
              Number(item.approved_quantity),
          );
        }
        const fullyReturned =
          current.refund_amount.gt(0) &&
          order.items.length > 0 &&
          order.items.every(
            (item) => (returned.get(item.id) ?? 0) === Number(item.quantity),
          );
        if (
          fullyReturned &&
          ['delivered', 'return_requested'].includes(order.status)
        ) {
          const steps =
            order.status === 'delivered'
              ? ['return_requested', 'returned']
              : ['returned'];
          const now = new Date();
          for (const [index, status] of steps.entries()) {
            await tx.order.update({
              where: { id: order.id },
              data: { status },
            });
            await tx.orderStatusEvent.create({
              data: {
                order_id: order.id,
                status,
                note: `All lines returned; return ${id}`,
                at: new Date(now.getTime() + index),
              },
            });
          }
          await tx.delivery.updateMany({
            where: { order_id: order.id, status: 'delivered' },
            data: { status: 'returned' },
          });
        }
        await this.audit.record(tx, {
          actorId,
          action: 'return.complete',
          entityType: 'return',
          entityId: id,
          before: { status: current.status },
          after: { status: 'completed', order_returned: fullyReturned },
        });
        await this.notifications?.record(
          tx,
          current.user_id,
          'return_update',
          'return',
          id,
          'completed',
        );
      },
      { timeout: 15_000 },
    );
    return this.get(id);
  }

  private requireQuantityUnit(quantity: number, wholeUnitsOnly: boolean): void {
    if (wholeUnitsOnly && !Number.isInteger(quantity)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SKU_WHOLE_UNITS_ONLY',
        message: 'This SKU accepts whole-unit quantities only',
        errors: [],
      });
    }
  }

  private async get(id: string) {
    const row = await this.prisma.return.findUnique({
      where: { id },
      include: returnInclude,
    });
    if (!row) throw new NotFoundException('Return not found');
    return this.present(row);
  }

  private present(row: ReturnRow) {
    return {
      id: row.id,
      order_id: row.order_id,
      user_id: row.user_id,
      type: row.type,
      status: row.status,
      reason: row.reason,
      expected_refund: Number(row.expected_refund),
      refund_amount: Number(row.refund_amount),
      currency: row.currency_code,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      items: row.items.map((item) => ({
        id: item.id,
        order_item_id: item.order_item_id,
        quantity: Number(item.quantity),
        approved_quantity: Number(item.approved_quantity),
        customer_reason: item.customer_reason,
        unit_price: Number(item.unit_price),
        currency: item.currency_code,
        expected_refund: calculateLineTotal(
          item.unit_price,
          Number(item.quantity),
        ),
        approved_refund: calculateLineTotal(
          item.unit_price,
          Number(item.approved_quantity),
        ),
        condition: item.condition,
        restock: item.restock,
        batch_id: item.batch_id,
      })),
      refund: row.refund
        ? {
            id: row.refund.id,
            order_id: row.refund.order_id,
            return_id: row.refund.return_id,
            amount: Number(row.refund.amount),
            currency: row.refund.currency_code,
            status: row.refund.status,
            reason: row.refund.reason,
            created_by: row.refund.created_by,
            created_at: row.refund.created_at,
          }
        : null,
    };
  }
}
