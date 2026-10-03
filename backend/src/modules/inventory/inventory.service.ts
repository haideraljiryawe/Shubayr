import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import {
  businessDate,
  businessDateText,
  parseBusinessDate,
} from '../finance/business-date';
import { DateRulesService } from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertOrderTransition } from '../orders/order-transition';
import {
  ApproveCountDto,
  BalanceQueryDto,
  CountScopeDto,
  CreateLocationDto,
  CreateOpeningDto,
  CreateTransferDto,
  CreateWarehouseDto,
  CreateWriteDownDto,
  LotQueryDto,
  MovementQueryDto,
  PageDto,
  UpdateLocationDto,
  UpdateWarehouseDto,
  CreateRetrievalDto,
  ReceiveRetrievalDto,
} from './dto/inventory.dto';

type Tx = Prisma.TransactionClient;
const D = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value);

type LockedBalance = {
  batch_id: string;
  location_id: string;
  quantity: Prisma.Decimal;
  reserved: Prisma.Decimal;
  variant_id: string;
  expiry_date: Date | null;
  entry_date: Date;
};

const pickListInclude = {
  order: { select: { order_number: true, status: true } },
  items: {
    include: {
      order_item: {
        select: { product_name_ar: true, product_name_en: true },
      },
      batch: { select: { lot_number: true, expiry_date: true } },
      location: {
        include: { warehouse: { select: { code: true, name: true } } },
      },
    },
    orderBy: [
      { location: { warehouse: { code: 'asc' as const } } },
      { location: { code: 'asc' as const } },
      { id: 'asc' as const },
    ],
  },
} satisfies Prisma.PickListInclude;
type PickListRow = Prisma.PickListGetPayload<{
  include: typeof pickListInclude;
}>;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationService,
    private readonly dates: DateRulesService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  listWarehouses() {
    return this.prisma.warehouse.findMany({
      include: { locations: { orderBy: { code: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  createWarehouse(input: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: { code: input.code.trim().toUpperCase(), name: input.name.trim() },
      include: { locations: true },
    });
  }

  async updateWarehouse(id: string, input: UpdateWarehouseDto) {
    await this.requireWarehouse(id);
    if (input.is_active === false) {
      const used = await this.prisma.batchStock.count({
        where: { location: { warehouse_id: id }, quantity: { gt: 0 } },
      });
      if (used)
        throw new ConflictException(
          'A warehouse with stock cannot be deactivated',
        );
    }
    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...input,
        ...(input.code ? { code: input.code.trim().toUpperCase() } : {}),
        ...(input.name ? { name: input.name.trim() } : {}),
        updated_at: new Date(),
      },
      include: { locations: { orderBy: { code: 'asc' } } },
    });
  }

  async deleteWarehouse(id: string) {
    await this.requireWarehouse(id);
    try {
      await this.prisma.warehouse.delete({ where: { id } });
    } catch (error) {
      if (this.isForeignKeyConflict(error))
        throw new ConflictException(
          'A used warehouse cannot be deleted; deactivate it instead',
        );
      throw error;
    }
  }

  async createLocation(warehouseId: string, input: CreateLocationDto) {
    const warehouse = await this.requireWarehouse(warehouseId);
    if (!warehouse.is_active)
      throw new ConflictException('Warehouse is inactive');
    return this.prisma.warehouseLocation.create({
      data: {
        warehouse_id: warehouseId,
        code: input.code.trim().toUpperCase(),
        description: input.description?.trim(),
        is_sellable: input.is_sellable ?? true,
      },
    });
  }

  async updateLocation(id: string, input: UpdateLocationDto) {
    const location = await this.prisma.warehouseLocation.findUnique({
      where: { id },
    });
    if (!location) throw new NotFoundException('Warehouse location not found');
    if (input.is_active === false) {
      const used = await this.prisma.batchStock.count({
        where: { location_id: id, quantity: { gt: 0 } },
      });
      if (used)
        throw new ConflictException(
          'A location with stock cannot be deactivated',
        );
    }
    return this.prisma.warehouseLocation.update({
      where: { id },
      data: {
        ...input,
        ...(input.code ? { code: input.code.trim().toUpperCase() } : {}),
        description: input.description?.trim(),
        updated_at: new Date(),
      },
    });
  }

  async deleteLocation(id: string) {
    const location = await this.prisma.warehouseLocation.findUnique({
      where: { id },
    });
    if (!location) throw new NotFoundException('Warehouse location not found');
    try {
      await this.prisma.warehouseLocation.delete({ where: { id } });
    } catch (error) {
      if (this.isForeignKeyConflict(error))
        throw new ConflictException(
          'A used location cannot be deleted; deactivate it instead',
        );
      throw error;
    }
  }

  async balances(query: BalanceQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.BatchStockWhereInput = {
      ...(query.variant_id ? { batch: { variant_id: query.variant_id } } : {}),
      ...(query.location_id ? { location_id: query.location_id } : {}),
      ...(query.warehouse_id
        ? { location: { warehouse_id: query.warehouse_id } }
        : {}),
      ...(query.batch_id ? { batch_id: query.batch_id } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.batchStock.findMany({
        where,
        include: {
          batch: {
            include: {
              variant: { select: { sku: true, product_id: true } },
              custody_holdings: {
                where: { status: 'in_custody' },
                select: { quantity: true },
              },
            },
          },
          location: true,
        },
        orderBy: [
          { batch: { expiry_date: 'asc' } },
          { batch_id: 'asc' },
          { location_id: 'asc' },
        ],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.batchStock.count({ where }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: data.map((row) => ({
        batch_id: row.batch_id,
        location_id: row.location_id,
        warehouse_id: row.location.warehouse_id,
        quantity: row.quantity,
        reserved: row.reserved,
        available: row.quantity.minus(row.reserved),
        custody: row.batch.custody_holdings.reduce(
          (sum, holding) => sum.plus(holding.quantity),
          D(0),
        ),
        variant_id: row.batch.variant_id,
        sku: row.batch.variant.sku,
        product_id: row.batch.variant.product_id,
        lot_number: row.batch.lot_number,
        expiry_date: row.batch.expiry_date,
        location_code: row.location.code,
        is_sellable: row.location.is_sellable,
      })),
    };
  }

  async lots(query: LotQueryDto, canViewCost: boolean) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where = query.variant_id
      ? { variant_id: query.variant_id }
      : undefined;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryBatch.findMany({
        where,
        include: {
          batch_stock: { include: { location: true } },
          custody_holdings: {
            where: { status: 'in_custody' },
            select: { quantity: true },
          },
        },
        orderBy: [{ expiry_date: 'asc' }, { entry_date: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.inventoryBatch.count({ where }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.presentLot(row, canViewCost)),
    };
  }

  async lot(id: string, canViewCost: boolean) {
    const row = await this.prisma.inventoryBatch.findUnique({
      where: { id },
      include: {
        batch_stock: { include: { location: true } },
        custody_holdings: {
          where: { status: 'in_custody' },
          select: { quantity: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Inventory lot not found');
    return this.presentLot(row, canViewCost);
  }

  async movements(query: MovementQueryDto, canViewCost: boolean) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variant_id ? { batch: { variant_id: query.variant_id } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.batch_id ? { batch_id: query.batch_id } : {}),
      ...(query.custody_party_id
        ? { custody_party_id: query.custody_party_id }
        : {}),
      ...(query.location_id
        ? {
            OR: [
              { from_location: query.location_id },
              { to_location: query.location_id },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: { batch: { select: { variant_id: true, lot_number: true } } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => (canViewCost ? row : this.omitCost(row))),
    };
  }

  async createOpening(
    actorId: string,
    permissions: string[],
    input: CreateOpeningDto,
  ) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one opening line is required',
      );
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/inventory/openings',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const id = randomUUID();
        let total = D(0);
        for (const line of input.lines) {
          const quantity = this.positive(line.quantity, 'quantity');
          const cost = this.nonNegative(line.unit_cost_iqd, 'unit_cost_iqd');
          total = total.plus(
            quantity.times(cost).plus(line.landed_cost_share ?? 0),
          );
        }
        if (!total.gt(0))
          throw new UnprocessableEntityException(
            'Opening stock value must be positive',
          );
        const entry = await this.ledger.post(tx, {
          sourceType: 'inventory_opening',
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: 'Opening inventory',
          lines: this.posting('1000', '3000', total),
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'inventory_opening',
          'INV-OPEN',
          dates.documentDate,
        );
        await tx.inventoryOpening.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        for (const line of input.lines) {
          const quantity = D(line.quantity);
          const unitCost = D(line.unit_cost_iqd).plus(
            D(line.landed_cost_share ?? 0).div(quantity),
          );
          const location = await tx.warehouseLocation.findUnique({
            where: { id: line.location_id },
            include: { warehouse: true },
          });
          const variant = await tx.productVariant.findUnique({
            where: { id: line.variant_id },
          });
          if (!location?.is_active || !location.warehouse.is_active)
            throw new ConflictException('Opening location is inactive');
          if (!variant)
            throw new NotFoundException('Product variant not found');
          this.requireQuantityUnit(quantity, variant.whole_units_only);
          const lot = await tx.inventoryBatch.create({
            data: {
              product_id: variant.product_id,
              variant_id: variant.id,
              lot_number: line.lot_number?.trim() ?? null,
              expiry_date: line.expiry_date
                ? parseBusinessDate(line.expiry_date)
                : null,
              purchase_cost: line.unit_cost_iqd,
              landed_cost_share: line.landed_cost_share ?? '0',
              currency_code: 'IQD',
              qty_received: quantity,
              source_type: 'inventory_opening',
              source_id: id,
            },
          });
          await tx.batchStock.create({
            data: { batch_id: lot.id, location_id: line.location_id, quantity },
          });
          await tx.inventoryOpeningLine.create({
            data: {
              opening_id: id,
              variant_id: variant.id,
              location_id: line.location_id,
              lot_id: lot.id,
              quantity,
              unit_cost_iqd: line.unit_cost_iqd,
              landed_cost_share: line.landed_cost_share ?? '0',
              expiry_date: line.expiry_date
                ? parseBusinessDate(line.expiry_date)
                : null,
            },
          });
          await tx.stockMovement.create({
            data: {
              batch_id: lot.id,
              type: 'receive',
              to_location: line.location_id,
              quantity,
              unit_cost_iqd: unitCost,
              reference: documentNumber,
              source_type: 'inventory_opening',
              source_id: id,
              user_id: actorId,
            },
          });
          await this.addValue(tx, variant.id, quantity, unitCost);
        }
        return this.getDocumentTx(
          tx,
          'opening',
          id,
          permissions.includes('cost.view'),
        );
      },
    });
  }

  async createTransfer(
    actorId: string,
    permissions: string[],
    input: CreateTransferDto,
  ) {
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one transfer line is required',
      );
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/inventory/transfers',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const id = randomUUID();
        const date = parseBusinessDate(input.document_date);
        const documentNumber = await this.numbers.issue(
          tx,
          'stock_transfer',
          'INV-XFER',
          date,
        );
        await tx.stockTransfer.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            document_date: date,
            reason: input.reason.trim(),
            created_by: actorId,
          },
        });
        for (const line of input.lines) {
          if (line.from_location_id === line.to_location_id)
            throw new UnprocessableEntityException(
              'Transfer locations must differ',
            );
          const quantity = this.positive(line.quantity, 'quantity');
          const [batch, destination] = await Promise.all([
            tx.inventoryBatch.findUnique({
              where: { id: line.batch_id },
              include: { variant: { select: { whole_units_only: true } } },
            }),
            tx.warehouseLocation.findUnique({
              where: { id: line.to_location_id },
              include: { warehouse: true },
            }),
          ]);
          if (!batch) throw new NotFoundException('Inventory lot not found');
          this.requireQuantityUnit(quantity, batch.variant.whole_units_only);
          if (!destination?.is_active || !destination.warehouse.is_active)
            throw new ConflictException('Destination is inactive');
          await this.lockBalance(tx, line.batch_id, line.from_location_id);
          const source = await tx.batchStock.findUnique({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.from_location_id,
              },
            },
          });
          if (!source || source.quantity.minus(source.reserved).lt(quantity))
            throw new ConflictException(
              'Transfer quantity exceeds unreserved stock',
            );
          await tx.batchStock.update({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.from_location_id,
              },
            },
            data: { quantity: { decrement: quantity } },
          });
          await tx.batchStock.upsert({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.to_location_id,
              },
            },
            update: { quantity: { increment: quantity } },
            create: {
              batch_id: line.batch_id,
              location_id: line.to_location_id,
              quantity,
            },
          });
          await tx.stockTransferLine.create({
            data: {
              transfer_id: id,
              variant_id: batch.variant_id,
              batch_id: line.batch_id,
              from_location_id: line.from_location_id,
              to_location_id: line.to_location_id,
              quantity,
            },
          });
          const unitCost = await this.averageCost(tx, batch.variant_id);
          await tx.stockMovement.create({
            data: {
              batch_id: line.batch_id,
              type: 'transfer',
              from_location: line.from_location_id,
              to_location: line.to_location_id,
              quantity,
              unit_cost_iqd: unitCost,
              reference: documentNumber,
              source_type: 'stock_transfer',
              source_id: id,
              user_id: actorId,
            },
          });
        }
        return this.getDocumentTx(
          tx,
          'transfer',
          id,
          permissions.includes('cost.view'),
        );
      },
    });
  }

  async createCount(actorId: string, input: CountScopeDto) {
    if (!input.warehouse_id && !input.location_id && !input.variant_id)
      throw new UnprocessableEntityException('A count scope is required');
    const snapshot = new Date();
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.issue(
        tx,
        'stock_count',
        'INV-COUNT',
        snapshot,
      );
      const count = await tx.stockCount.create({
        data: {
          document_number: number,
          warehouse_id: input.warehouse_id,
          location_id: input.location_id,
          variant_id: input.variant_id,
          snapshot_at: snapshot,
          reason: input.reason.trim(),
          created_by: actorId,
        },
      });
      const balances = await tx.batchStock.findMany({
        where: {
          ...(input.warehouse_id
            ? { location: { warehouse_id: input.warehouse_id } }
            : {}),
          ...(input.location_id ? { location_id: input.location_id } : {}),
          ...(input.variant_id
            ? { batch: { variant_id: input.variant_id } }
            : {}),
        },
        include: { batch: true },
      });
      await tx.stockCountLine.createMany({
        data: balances.map((row) => ({
          count_id: count.id,
          variant_id: row.batch.variant_id,
          batch_id: row.batch_id,
          location_id: row.location_id,
          system_quantity: row.quantity,
          counted_quantity: row.quantity,
          difference: 0,
        })),
      });
      return this.getDocumentTx(tx, 'count', count.id, true);
    });
  }

  async approveCount(
    actorId: string,
    permissions: string[],
    id: string,
    input: ApproveCountDto,
  ) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/inventory/counts/${id}/approve`,
      payload: input,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${id}::uuid FOR UPDATE`;
        const count = await tx.stockCount.findUnique({
          where: { id },
          include: {
            lines: {
              include: { variant: { select: { whole_units_only: true } } },
            },
          },
        });
        if (!count) throw new NotFoundException('Stock count not found');
        if (count.status !== 'draft')
          throw new ConflictException('Stock count is already approved');
        assertDifferentActor(
          actorId,
          count.created_by,
          'The stock-count creator cannot approve their own count',
        );
        const changed = await tx.stockMovement.count({
          where: {
            created_at: { gt: count.snapshot_at },
            ...(count.location_id
              ? {
                  OR: [
                    { from_location: count.location_id },
                    { to_location: count.location_id },
                  ],
                }
              : {}),
            ...(count.warehouse_id
              ? {
                  OR: [
                    { source: { warehouse_id: count.warehouse_id } },
                    { destination: { warehouse_id: count.warehouse_id } },
                  ],
                }
              : {}),
            ...(count.variant_id
              ? { batch: { variant_id: count.variant_id } }
              : {}),
          },
        });
        if (changed)
          throw new ConflictException(
            'Stock moved within the count scope after the snapshot',
          );
        const supplied = new Map(
          input.lines.map((line) => [
            `${line.batch_id}:${line.location_id}`,
            line,
          ]),
        );
        let loss = D(0);
        let gain = D(0);
        for (const line of count.lines) {
          const answer = supplied.get(`${line.batch_id}:${line.location_id}`);
          if (!answer)
            throw new UnprocessableEntityException(
              'A counted quantity is required for every snapshot line',
            );
          const counted = this.nonNegative(
            answer.counted_quantity,
            'counted_quantity',
          );
          this.requireQuantityUnit(counted, line.variant.whole_units_only);
          const difference = counted.minus(line.system_quantity);
          await this.lockBalance(tx, line.batch_id, line.location_id);
          const balance = await tx.batchStock.findUniqueOrThrow({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.location_id,
              },
            },
          });
          if (counted.lt(balance.reserved))
            await this.releaseReservationsForReduction(
              tx,
              line.batch_id,
              line.location_id,
              balance.reserved.minus(counted),
              actorId,
              'stock_count',
              id,
              `count:${id}`,
            );
          const cost = await this.averageCost(tx, line.variant_id);
          await tx.batchStock.update({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.location_id,
              },
            },
            data: { quantity: counted },
          });
          await tx.stockCountLine.update({
            where: { id: line.id },
            data: { counted_quantity: counted, difference },
          });
          if (!difference.isZero()) {
            await tx.stockMovement.create({
              data: {
                batch_id: line.batch_id,
                type: 'adjust',
                from_location: difference.lt(0) ? line.location_id : null,
                to_location: difference.gt(0) ? line.location_id : null,
                quantity: difference.abs(),
                unit_cost_iqd: cost,
                reference: count.document_number,
                source_type: 'stock_count',
                source_id: id,
                user_id: actorId,
              },
            });
            await this.addValue(tx, line.variant_id, difference, cost);
            const value = difference.abs().times(cost);
            if (difference.lt(0)) loss = loss.plus(value);
            else gain = gain.plus(value);
          }
        }
        let journalId: string | null = null;
        const lines = [];
        if (loss.gt(0)) lines.push(...this.posting('5010', '1000', loss));
        if (gain.gt(0)) lines.push(...this.posting('1000', '5011', gain));
        if (lines.length) {
          const entry = await this.ledger.post(tx, {
            sourceType: 'stock_count',
            sourceId: id,
            event: 'approve',
            documentDate: dates.documentDate,
            accountingDate: dates.accountingDate,
            createdBy: actorId,
            description: count.reason,
            lines,
          });
          journalId = entry.id;
        }
        await tx.stockCount.update({
          where: { id },
          data: {
            status: 'approved',
            operation_id: input.operation_id,
            approved_by: actorId,
            approved_at: new Date(),
            journal_entry_id: journalId,
          },
        });
        return this.getDocumentTx(
          tx,
          'count',
          id,
          permissions.includes('cost.view'),
        );
      },
    });
  }

  async createWriteDown(
    actorId: string,
    permissions: string[],
    input: CreateWriteDownDto,
  ) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one write-down line is required',
      );
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/inventory/write-downs',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const id = randomUUID();
        let total = D(0);
        const prepared: Array<{
          batchId: string;
          locationId: string;
          variantId: string;
          quantity: Prisma.Decimal;
          cost: Prisma.Decimal;
        }> = [];
        for (const line of input.lines) {
          const quantity = this.positive(line.quantity, 'quantity');
          await this.lockBalance(tx, line.batch_id, line.location_id);
          const balance = await tx.batchStock.findUnique({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: line.location_id,
              },
            },
            include: {
              batch: {
                include: { variant: { select: { whole_units_only: true } } },
              },
              location: true,
            },
          });
          if (!balance)
            throw new NotFoundException('Inventory balance not found');
          if (balance.location.is_sellable)
            throw new ConflictException(
              'Write-down stock must first be moved to a non-sellable location',
            );
          this.requireQuantityUnit(
            quantity,
            balance.batch.variant.whole_units_only,
          );
          if (balance.quantity.lt(quantity))
            throw new ConflictException('Write-down quantity exceeds stock');
          const reservationReduction = balance.reserved.minus(
            balance.quantity.minus(quantity),
          );
          if (reservationReduction.gt(0))
            await this.releaseReservationsForReduction(
              tx,
              line.batch_id,
              line.location_id,
              reservationReduction,
              actorId,
              'inventory_write_down',
              id,
              `write-down:${id}`,
            );
          const cost = await this.averageCost(tx, balance.batch.variant_id);
          total = total.plus(quantity.times(cost));
          prepared.push({
            batchId: line.batch_id,
            locationId: line.location_id,
            variantId: balance.batch.variant_id,
            quantity,
            cost,
          });
        }
        if (!total.gt(0))
          throw new ConflictException('Write-down has no book value');
        const entry = await this.ledger.post(tx, {
          sourceType: 'inventory_write_down',
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: input.reason,
          lines: this.posting('5010', '1000', total),
        });
        const number = await this.numbers.issue(
          tx,
          'inventory_write_down',
          'INV-WD',
          dates.documentDate,
        );
        await tx.inventoryWriteDown.create({
          data: {
            id,
            document_number: number,
            operation_id: input.operation_id,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            reason: input.reason.trim(),
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        for (const line of prepared) {
          await tx.batchStock.update({
            where: {
              batch_id_location_id: {
                batch_id: line.batchId,
                location_id: line.locationId,
              },
            },
            data: { quantity: { decrement: line.quantity } },
          });
          await tx.inventoryWriteDownLine.create({
            data: {
              write_down_id: id,
              variant_id: line.variantId,
              batch_id: line.batchId,
              location_id: line.locationId,
              quantity: line.quantity,
              unit_cost_iqd: line.cost,
            },
          });
          await tx.stockMovement.create({
            data: {
              batch_id: line.batchId,
              type: 'write_down',
              from_location: line.locationId,
              quantity: line.quantity,
              unit_cost_iqd: line.cost,
              reference: number,
              source_type: 'inventory_write_down',
              source_id: id,
              user_id: actorId,
            },
          });
          await this.addValue(
            tx,
            line.variantId,
            line.quantity.negated(),
            line.cost,
          );
        }
        return this.getDocumentTx(
          tx,
          'write_down',
          id,
          permissions.includes('cost.view'),
        );
      },
    });
  }

  getDocument(type: string, id: string, canViewCost: boolean) {
    return this.getDocumentTx(this.prisma, type, id, canViewCost);
  }

  async listDocuments(type: string, query: PageDto, canViewCost: boolean) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const paging = {
      orderBy: [{ created_at: 'desc' as const }, { id: 'desc' as const }],
      skip: (page - 1) * perPage,
      take: perPage,
    };
    let data: unknown[];
    let total: number;
    if (type === 'opening') {
      [data, total] = await this.prisma.$transaction([
        this.prisma.inventoryOpening.findMany({
          ...paging,
          include: {
            lines: true,
            journal_entry: { select: { id: true, document_number: true } },
          },
        }),
        this.prisma.inventoryOpening.count(),
      ]);
    } else if (type === 'transfer') {
      [data, total] = await this.prisma.$transaction([
        this.prisma.stockTransfer.findMany({
          ...paging,
          include: { lines: true },
        }),
        this.prisma.stockTransfer.count(),
      ]);
    } else if (type === 'count') {
      [data, total] = await this.prisma.$transaction([
        this.prisma.stockCount.findMany({
          ...paging,
          include: {
            lines: true,
            journal_entry: { select: { id: true, document_number: true } },
          },
        }),
        this.prisma.stockCount.count(),
      ]);
    } else if (type === 'write_down') {
      [data, total] = await this.prisma.$transaction([
        this.prisma.inventoryWriteDown.findMany({
          ...paging,
          include: {
            lines: true,
            journal_entry: { select: { id: true, document_number: true } },
          },
        }),
        this.prisma.inventoryWriteDown.count(),
      ]);
    } else {
      throw new NotFoundException('Inventory document type not found');
    }
    return {
      page,
      per_page: perPage,
      total,
      data: canViewCost
        ? data
        : data.map((row) => this.presentDocument(row, false)),
    };
  }

  async allocateOrder(
    tx: Tx,
    orderId: string,
    actorId?: string,
    allowShort = false,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const today = businessDate();
    const shortages: Array<{
      order_item_id: string;
      variant_id: string;
      requested: string;
      allocated: string;
      short: string;
    }> = [];
    for (const item of order.items) {
      const existing = await tx.stockReservation.aggregate({
        where: { order_item_id: item.id, status: 'reserved' },
        _sum: { quantity: true },
      });
      const alreadyAllocated = D(existing._sum.quantity ?? 0);
      let remaining = D(item.quantity).minus(alreadyAllocated);
      if (!remaining.gt(0)) continue;
      const rows = await tx.$queryRaw<LockedBalance[]>(Prisma.sql`
        SELECT s.batch_id, s.location_id, s.quantity, s.reserved,
               b.variant_id, b.expiry_date, b.entry_date
        FROM batch_stock s
        JOIN inventory_batches b ON b.id = s.batch_id
        JOIN warehouse_locations l ON l.id = s.location_id
        JOIN warehouses w ON w.id = l.warehouse_id
        WHERE b.variant_id = ${item.variant_id}::uuid
          AND s.quantity > s.reserved AND l.is_active AND l.is_sellable AND w.is_active
          AND (b.expiry_date IS NULL OR b.expiry_date >= ${today})
        ORDER BY b.expiry_date ASC NULLS LAST, b.entry_date ASC, b.id ASC, l.id ASC
        FOR UPDATE OF s
      `);
      const available = rows.reduce(
        (sum, row) => sum.plus(row.quantity.minus(row.reserved)),
        D(0),
      );
      if (available.lt(remaining)) {
        if (!allowShort)
          throw new ConflictException({
            status: 409,
            code: 'INSUFFICIENT_STOCK',
            message: 'Requested quantity exceeds available stock',
            errors: [
              {
                field: 'quantity',
                code: 'INSUFFICIENT_STOCK',
                message: 'Requested quantity exceeds available stock',
                requested: remaining.toString(),
                available: available.toString(),
                variant_id: item.variant_id,
              },
            ],
          });
        shortages.push({
          order_item_id: item.id,
          variant_id: item.variant_id,
          requested: D(item.quantity).toString(),
          allocated: alreadyAllocated.plus(available).toString(),
          short: remaining.minus(available).toString(),
        });
      }
      for (const row of rows) {
        if (remaining.isZero()) break;
        const quantity = Prisma.Decimal.min(
          remaining,
          row.quantity.minus(row.reserved),
        );
        await tx.batchStock.update({
          where: {
            batch_id_location_id: {
              batch_id: row.batch_id,
              location_id: row.location_id,
            },
          },
          data: { reserved: { increment: quantity } },
        });
        const reservation = await tx.stockReservation.create({
          data: {
            order_id: orderId,
            order_item_id: item.id,
            batch_id: row.batch_id,
            location_id: row.location_id,
            quantity,
          },
        });
        await tx.stockMovement.create({
          data: {
            batch_id: row.batch_id,
            type: 'reserve',
            from_location: row.location_id,
            to_location: row.location_id,
            quantity,
            reference: order.order_number,
            source_type: 'stock_reservation',
            source_id: reservation.id,
            user_id: actorId,
          },
        });
        remaining = remaining.minus(quantity);
      }
    }
    return shortages;
  }

  async prepareOrder(tx: Tx, orderId: string, actorId: string) {
    const reservations = await tx.stockReservation.findMany({
      where: { order_id: orderId, status: 'reserved' },
      include: {
        batch: true,
        location: { include: { warehouse: true } },
      },
      orderBy: { id: 'asc' },
    });
    const today = businessDate();
    for (const row of reservations) {
      const expired = row.batch.expiry_date
        ? row.batch.expiry_date < today
        : false;
      if (
        expired ||
        !row.location.is_active ||
        !row.location.is_sellable ||
        !row.location.warehouse.is_active
      ) {
        await this.releaseReservation(tx, row, actorId, 'preparation_recheck');
      }
    }
    const shortages = await this.allocateOrder(tx, orderId, actorId, true);
    const active = await tx.stockReservation.findMany({
      where: { order_id: orderId, status: 'reserved' },
      include: {
        batch: true,
        location: { include: { warehouse: true } },
      },
      orderBy: [
        { location: { warehouse: { code: 'asc' } } },
        { location: { code: 'asc' } },
        { batch: { expiry_date: 'asc' } },
        { id: 'asc' },
      ],
    });
    const pickList = await tx.pickList.upsert({
      where: { order_id: orderId },
      create: { order_id: orderId, assigned_to: actorId, status: 'open' },
      update: {
        assigned_to: actorId,
        status: 'open',
        completed_at: null,
        items: { deleteMany: {} },
      },
    });
    if (active.length) {
      await tx.pickListItem.createMany({
        data: active.map((row) => ({
          pick_list_id: pickList.id,
          order_item_id: row.order_item_id,
          batch_id: row.batch_id,
          location_id: row.location_id,
          quantity: row.quantity,
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        inventory_attention_required: shortages.length > 0,
        attention_details: shortages.length
          ? { short_lines: shortages }
          : Prisma.DbNull,
      },
    });
    return { pick_list_id: pickList.id, shortages };
  }

  async getOrderPickList(orderId: string) {
    const row = await this.prisma.pickList.findUnique({
      where: { order_id: orderId },
      include: pickListInclude,
    });
    if (!row) throw new NotFoundException('Pick list not found');
    return this.presentPickList(row);
  }

  async printablePickLists(orderIds: string[]) {
    const ids = [...new Set(orderIds)];
    if (!ids.length)
      throw new UnprocessableEntityException('order_ids is required');
    const rows = await this.prisma.pickList.findMany({
      where: { order_id: { in: ids } },
      include: pickListInclude,
      orderBy: { order: { order_number: 'asc' } },
    });
    return {
      generated_at: new Date(),
      data: rows.map((row) => this.presentPickList(row)),
    };
  }

  private presentPickList(row: PickListRow) {
    return {
      id: row.id,
      order_id: row.order_id,
      order_number: row.order.order_number,
      order_status: row.order.status,
      assigned_to: row.assigned_to,
      status: row.status,
      created_at: row.created_at,
      completed_at: row.completed_at,
      items: row.items.map((item) => ({
        id: item.id,
        order_item_id: item.order_item_id,
        product_name_ar: item.order_item?.product_name_ar ?? '',
        product_name_en: item.order_item?.product_name_en ?? '',
        batch_id: item.batch_id,
        lot_number: item.batch.lot_number,
        expiry_date: item.batch.expiry_date,
        location_id: item.location_id,
        warehouse_code: item.location.warehouse.code,
        warehouse_name: item.location.warehouse.name,
        location_code: item.location.code,
        quantity: Number(item.quantity),
        picked: item.picked,
      })),
    };
  }

  private async releaseReservation(
    tx: Tx,
    row: {
      id: string;
      batch_id: string;
      location_id: string;
      quantity: Prisma.Decimal;
    },
    actorId: string,
    reason: string,
  ) {
    await this.lockBalance(tx, row.batch_id, row.location_id);
    const changed = await tx.stockReservation.updateMany({
      where: { id: row.id, status: 'reserved' },
      data: { status: 'released', released_at: new Date() },
    });
    if (!changed.count) return;
    await tx.batchStock.update({
      where: {
        batch_id_location_id: {
          batch_id: row.batch_id,
          location_id: row.location_id,
        },
      },
      data: { reserved: { decrement: row.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        batch_id: row.batch_id,
        type: 'release',
        from_location: row.location_id,
        to_location: row.location_id,
        quantity: row.quantity,
        reference: reason,
        source_type: 'stock_reservation',
        source_id: row.id,
        user_id: actorId,
      },
    });
  }

  async reduceOrderItemReservations(
    tx: Tx,
    orderItemId: string,
    targetQuantity: Prisma.Decimal,
    actorId: string,
  ) {
    const rows = await tx.stockReservation.findMany({
      where: { order_item_id: orderItemId, status: 'reserved' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const total = rows.reduce((sum, row) => sum.plus(row.quantity), D(0));
    let excess = total.minus(targetQuantity);
    for (const row of rows) {
      if (!excess.gt(0)) break;
      const amount = Prisma.Decimal.min(excess, row.quantity);
      if (amount.eq(row.quantity)) {
        await this.releaseReservation(tx, row, actorId, 'order_line_reduction');
      } else {
        await this.lockBalance(tx, row.batch_id, row.location_id);
        await tx.stockReservation.update({
          where: { id: row.id },
          data: { quantity: { decrement: amount } },
        });
        await tx.batchStock.update({
          where: {
            batch_id_location_id: {
              batch_id: row.batch_id,
              location_id: row.location_id,
            },
          },
          data: { reserved: { decrement: amount } },
        });
        await tx.stockMovement.create({
          data: {
            batch_id: row.batch_id,
            type: 'release',
            from_location: row.location_id,
            to_location: row.location_id,
            quantity: amount,
            reference: 'order_line_reduction',
            source_type: 'stock_reservation',
            source_id: row.id,
            user_id: actorId,
          },
        });
      }
      excess = excess.minus(amount);
    }
  }

  async releaseOrder(tx: Tx, orderId: string, actorId?: string) {
    const reservations = await tx.stockReservation.findMany({
      where: { order_id: orderId, status: 'reserved' },
      orderBy: { id: 'asc' },
    });
    for (const row of reservations) {
      await this.lockBalance(tx, row.batch_id, row.location_id);
      const changed = await tx.stockReservation.updateMany({
        where: { id: row.id, status: 'reserved' },
        data: { status: 'released', released_at: new Date() },
      });
      if (!changed.count) continue;
      await tx.batchStock.update({
        where: {
          batch_id_location_id: {
            batch_id: row.batch_id,
            location_id: row.location_id,
          },
        },
        data: { reserved: { decrement: row.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: row.batch_id,
          type: 'release',
          from_location: row.location_id,
          to_location: row.location_id,
          quantity: row.quantity,
          reference: `order:${orderId}`,
          source_type: 'stock_reservation',
          source_id: row.id,
          user_id: actorId,
        },
      });
    }
  }

  async issueOrderToCustody(
    tx: Tx,
    orderId: string,
    deliveryId: string,
    partyId: string,
    actorId: string,
  ) {
    const postingDate = businessDate();
    const reservations = await tx.stockReservation.findMany({
      where: { order_id: orderId, status: 'reserved' },
      include: { batch: true },
      orderBy: { id: 'asc' },
    });
    if (!reservations.length)
      throw new ConflictException('Order has no active stock reservations');
    let total = D(0);
    for (const row of reservations) {
      await this.lockBalance(tx, row.batch_id, row.location_id);
      const cost = await this.averageCost(tx, row.batch.variant_id);
      await tx.batchStock.update({
        where: {
          batch_id_location_id: {
            batch_id: row.batch_id,
            location_id: row.location_id,
          },
        },
        data: {
          quantity: { decrement: row.quantity },
          reserved: { decrement: row.quantity },
        },
      });
      await tx.stockReservation.update({
        where: { id: row.id },
        data: {
          status: 'consumed',
          consumed_at: new Date(),
          issue_cost_iqd: cost,
        },
      });
      await tx.custodyHolding.create({
        data: {
          order_id: orderId,
          order_item_id: row.order_item_id!,
          delivery_id: deliveryId,
          custody_party_id: partyId,
          batch_id: row.batch_id,
          quantity: row.quantity,
          remaining_quantity: row.quantity,
          unit_cost_iqd: cost,
        },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: row.batch_id,
          type: 'issue_to_custody',
          from_location: row.location_id,
          quantity: row.quantity,
          unit_cost_iqd: cost,
          reference: `delivery:${deliveryId}`,
          source_type: 'order',
          source_id: orderId,
          custody_party_id: partyId,
          user_id: actorId,
        },
      });
      await this.addValue(
        tx,
        row.batch.variant_id,
        D(row.quantity).negated(),
        cost,
      );
      total = total.plus(D(row.quantity).times(cost));
    }
    if (total.gt(0))
      await this.ledger.post(tx, {
        sourceType: 'order',
        sourceId: orderId,
        event: 'issue_to_custody',
        documentDate: postingDate,
        accountingDate: postingDate,
        createdBy: actorId,
        description: 'Inventory issued to delivery custody',
        lines: this.posting('1010', '1000', total),
      });
  }

  async settleCustodyToSold(tx: Tx, orderId: string, actorId: string) {
    const postingDate = businessDate();
    const holdings = await tx.custodyHolding.findMany({
      where: {
        order_id: orderId,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      orderBy: { id: 'asc' },
    });
    if (!holdings.length) return;
    let total = D(0);
    for (const row of holdings) {
      await tx.custodyHolding.update({
        where: { id: row.id },
        data: {
          status: 'sold',
          remaining_quantity: 0,
          settled_at: new Date(),
        },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: row.batch_id,
          type: 'custody_to_sold',
          quantity: row.quantity,
          unit_cost_iqd: row.unit_cost_iqd,
          reference: `order:${orderId}`,
          source_type: 'order',
          source_id: orderId,
          custody_party_id: row.custody_party_id,
          user_id: actorId,
        },
      });
      total = total.plus(row.quantity.times(row.unit_cost_iqd));
    }
    if (total.gt(0))
      await this.ledger.post(tx, {
        sourceType: 'order',
        sourceId: orderId,
        event: 'custody_to_sold',
        documentDate: postingDate,
        accountingDate: postingDate,
        createdBy: actorId,
        description: 'Delivered inventory cost of goods sold',
        lines: this.posting('5000', '1010', total),
      });
  }

  createRetrieval(
    actorId: string,
    orderId: string,
    input: CreateRetrievalDto,
    canViewCost = false,
  ) {
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/orders/${orderId}/retrievals`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const row = await this.openRetrieval(
          tx,
          orderId,
          actorId,
          input.outcome,
          input.reason,
          input.operation_id,
        );
        return this.getRetrievalTx(tx, row.id, canViewCost);
      },
    });
  }

  async openRetrieval(
    tx: Tx,
    orderId: string,
    actorId: string,
    outcome: 'cancel' | 'retry',
    reason: string,
    operationId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (outcome === 'retry' && order.status !== 'failed')
      throw new ConflictException(
        'Only a failed order can be retrieved for retry',
      );
    if (outcome === 'cancel' && order.status !== 'cancelled')
      throw new ConflictException(
        'Cancellation retrieval requires a cancelled order',
      );
    if (!order.delivery || !order.delivery.agent_id)
      throw new ConflictException('Order has no delivery custody party');
    const existing = await tx.retrieval.findFirst({
      where: { order_id: orderId, status: { not: 'closed' } },
    });
    if (existing)
      throw new ConflictException('An open retrieval already exists');
    const holdings = await tx.custodyHolding.findMany({
      where: {
        order_id: orderId,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      include: { batch: true },
      orderBy: { id: 'asc' },
    });
    if (!holdings.length)
      throw new ConflictException('Order has no goods remaining in custody');
    const date = businessDate();
    const number = await this.numbers.issue(tx, 'retrieval', 'RET', date);
    const retrieval = await tx.retrieval.create({
      data: {
        document_number: number,
        operation_id: operationId,
        order_id: orderId,
        delivery_id: order.delivery.id,
        custody_party_id: order.delivery.agent_id,
        outcome,
        reason: reason.trim(),
        document_date: date,
        accounting_date: date,
        created_by: actorId,
        lines: {
          create: holdings.map((holding) => ({
            custody_holding_id: holding.id,
            order_item_id: holding.order_item_id,
            variant_id: holding.batch.variant_id,
            batch_id: holding.batch_id,
            expected_quantity: holding.remaining_quantity,
            unit_cost_iqd: holding.unit_cost_iqd,
          })),
        },
      },
    });
    await this.audit.record(tx, {
      actorId,
      action: 'retrieval.open',
      entityType: 'retrieval',
      entityId: retrieval.id,
      after: { order_id: orderId, outcome, reason },
    });
    await this.notifications.recordStaffWithPermission(
      tx,
      'retrieval.view',
      'retrieval_update',
      'retrieval',
      retrieval.id,
      'opened',
    );
    return retrieval;
  }

  getRetrieval(id: string, canViewCost = false) {
    return this.getRetrievalTx(this.prisma, id, canViewCost);
  }

  receiveRetrieval(
    actorId: string,
    id: string,
    input: ReceiveRetrievalDto,
    canViewCost = false,
  ) {
    if (!input.lines.length)
      throw new UnprocessableEntityException('At least one line is required');
    if (
      new Set(input.lines.map((line) => line.line_id)).size !==
      input.lines.length
    )
      throw new UnprocessableEntityException('Retrieval lines must not repeat');
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/retrievals/${id}/receive`,
      payload: input,
      work: async (tx) => {
        await tx.$queryRaw`SELECT id FROM retrievals WHERE id = ${id}::uuid FOR UPDATE`;
        const retrieval = await tx.retrieval.findUnique({
          where: { id },
          include: { order: true, lines: true },
        });
        if (!retrieval) throw new NotFoundException('Retrieval not found');
        if (retrieval.status === 'closed')
          throw new ConflictException('Retrieval is already closed');
        let total = D(0);
        for (const supplied of input.lines) {
          const line = retrieval.lines.find(
            (entry) => entry.id === supplied.line_id,
          );
          if (!line) throw new NotFoundException('Retrieval line not found');
          const quantity = this.positive(supplied.quantity, 'quantity');
          const outstanding = line.expected_quantity.minus(
            line.received_quantity,
          );
          if (quantity.gt(outstanding))
            throw new ConflictException(
              'Received quantity exceeds retrieval balance',
            );
          const location = await tx.warehouseLocation.findUnique({
            where: { id: supplied.location_id },
            include: { warehouse: true },
          });
          if (!location?.is_active || !location.warehouse.is_active)
            throw new ConflictException(
              'Chosen retrieval location is inactive',
            );
          await tx.$queryRaw`SELECT id FROM custody_holdings WHERE id = ${line.custody_holding_id}::uuid FOR UPDATE`;
          const holding = await tx.custodyHolding.findUniqueOrThrow({
            where: { id: line.custody_holding_id },
          });
          if (quantity.gt(holding.remaining_quantity))
            throw new ConflictException('Retrieval exceeds goods in custody');
          await this.lockBalance(tx, line.batch_id, supplied.location_id);
          await tx.batchStock.upsert({
            where: {
              batch_id_location_id: {
                batch_id: line.batch_id,
                location_id: supplied.location_id,
              },
            },
            create: {
              batch_id: line.batch_id,
              location_id: supplied.location_id,
              quantity,
              reserved: retrieval.outcome === 'retry' ? quantity : 0,
            },
            update: {
              quantity: { increment: quantity },
              ...(retrieval.outcome === 'retry'
                ? { reserved: { increment: quantity } }
                : {}),
            },
          });
          if (retrieval.outcome === 'retry') {
            await tx.stockReservation.create({
              data: {
                order_id: retrieval.order_id,
                order_item_id: line.order_item_id,
                batch_id: line.batch_id,
                location_id: supplied.location_id,
                quantity,
              },
            });
          }
          const nextRemaining = holding.remaining_quantity.minus(quantity);
          await tx.custodyHolding.update({
            where: { id: holding.id },
            data: {
              remaining_quantity: nextRemaining,
              ...(nextRemaining.isZero()
                ? { status: 'returned', settled_at: new Date() }
                : {}),
            },
          });
          await tx.retrievalLine.update({
            where: { id: line.id },
            data: {
              received_quantity: { increment: quantity },
              location_id: supplied.location_id,
              received_at: new Date(),
            },
          });
          await tx.stockMovement.create({
            data: {
              batch_id: line.batch_id,
              type: 'return_in',
              to_location: supplied.location_id,
              quantity,
              unit_cost_iqd: line.unit_cost_iqd,
              reference: retrieval.document_number,
              source_type: 'retrieval',
              source_id: retrieval.id,
              custody_party_id: retrieval.custody_party_id,
              user_id: actorId,
            },
          });
          await this.addValue(
            tx,
            line.variant_id,
            quantity,
            line.unit_cost_iqd,
          );
          total = total.plus(quantity.times(line.unit_cost_iqd));
        }
        const postingDate = businessDate();
        const entry = await this.ledger.post(tx, {
          sourceType: 'retrieval',
          sourceId: id,
          event: `receive:${createHash('sha256').update(input.operation_id).digest('hex').slice(0, 32)}`,
          documentDate: postingDate,
          accountingDate: postingDate,
          createdBy: actorId,
          description:
            'Goods returned from delivery custody at original issue cost',
          lines: this.posting('1000', '1010', total),
        });
        const remaining = await tx.retrievalLine.aggregate({
          where: { retrieval_id: id },
          _sum: { expected_quantity: true, received_quantity: true },
        });
        const complete = D(remaining._sum.expected_quantity ?? 0).eq(
          D(remaining._sum.received_quantity ?? 0),
        );
        await tx.retrieval.update({
          where: { id },
          data: {
            status: complete ? 'closed' : 'partially_received',
            journal_entry_id: retrieval.journal_entry_id ?? entry.id,
            ...(complete ? { closed_by: actorId, closed_at: new Date() } : {}),
          },
        });
        if (complete && retrieval.outcome === 'retry') {
          assertOrderTransition(
            retrieval.order.status,
            'ready_for_dispatch',
            retrieval.order.version,
            retrieval.order.version,
          );
          const delivery = await tx.delivery.create({
            data: {
              order_id: retrieval.order_id,
              status: 'assigned',
              delivery_fee: retrieval.order.delivery_fee,
            },
          });
          await tx.order.update({
            where: { id: retrieval.order_id },
            data: {
              status: 'ready_for_dispatch',
              version: { increment: 1 },
              delivery_id: delivery.id,
            },
          });
          await tx.orderStatusEvent.create({
            data: {
              order_id: retrieval.order_id,
              status: 'ready_for_dispatch',
              note: `Retrieval ${retrieval.document_number} closed for retry`,
            },
          });
        }
        await this.audit.record(tx, {
          actorId,
          action: complete ? 'retrieval.close' : 'retrieval.receive',
          entityType: 'retrieval',
          entityId: id,
          before: { status: retrieval.status },
          after: { status: complete ? 'closed' : 'partially_received' },
        });
        await this.notifications.recordStaffWithPermission(
          tx,
          'retrieval.view',
          'retrieval_update',
          'retrieval',
          id,
          complete ? 'closed' : 'partially received',
        );
        return this.getRetrievalTx(tx, id, canViewCost);
      },
    });
  }

  private async getRetrievalTx(
    tx: Tx | PrismaService,
    id: string,
    canViewCost: boolean,
  ) {
    const row = await tx.retrieval.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            order_item: {
              select: { product_name_en: true, product_name_ar: true },
            },
            batch: { select: { lot_number: true } },
            location: { select: { code: true, warehouse_id: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Retrieval not found');
    return {
      ...row,
      document_date: businessDateText(row.document_date),
      accounting_date: businessDateText(row.accounting_date),
      lines: row.lines.map((source) => {
        const { retrieval_id, unit_cost_iqd, ...line } = source;
        void retrieval_id;
        return {
          ...line,
          expected_quantity: Number(line.expected_quantity),
          received_quantity: Number(line.received_quantity),
          ...(canViewCost ? { unit_cost_iqd: Number(unit_cost_iqd) } : {}),
        };
      }),
    };
  }

  async returnToStock(
    tx: Tx,
    returnId: string,
    returnItemId: string,
    orderItemId: string,
    quantity: number,
    actorId: string,
  ): Promise<string> {
    const postingDate = businessDate();
    const origins = await tx.custodyHolding.findMany({
      where: { order_item_id: orderItemId, status: 'sold' },
      include: { batch: true },
      orderBy: [{ issued_at: 'asc' }, { id: 'asc' }],
    });
    let remaining = D(quantity);
    let first = '';
    let returnedValue = D(0);
    for (const origin of origins) {
      if (remaining.isZero()) break;
      const prior = await tx.stockMovement.aggregate({
        where: {
          return_item: { order_item_id: orderItemId },
          batch_id: origin.batch_id,
          type: 'return_in',
        },
        _sum: { quantity: true },
      });
      const available = origin.quantity.minus(prior._sum.quantity ?? 0);
      if (!available.gt(0)) continue;
      const amount = Prisma.Decimal.min(remaining, available);
      const reservation = await tx.stockReservation.findFirst({
        where: {
          order_item_id: orderItemId,
          batch_id: origin.batch_id,
          status: 'consumed',
        },
      });
      if (!reservation)
        throw new ConflictException('Original issue location is unavailable');
      first ||= origin.batch_id;
      await tx.batchStock.upsert({
        where: {
          batch_id_location_id: {
            batch_id: origin.batch_id,
            location_id: reservation.location_id,
          },
        },
        update: { quantity: { increment: amount } },
        create: {
          batch_id: origin.batch_id,
          location_id: reservation.location_id,
          quantity: amount,
        },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: origin.batch_id,
          return_item_id: returnItemId,
          type: 'return_in',
          to_location: reservation.location_id,
          quantity: amount,
          unit_cost_iqd: origin.unit_cost_iqd,
          reference: `return:${returnId}`,
          source_type: 'return',
          source_id: returnId,
          user_id: actorId,
        },
      });
      await this.addValue(
        tx,
        origin.batch.variant_id,
        amount,
        origin.unit_cost_iqd,
      );
      returnedValue = returnedValue.plus(amount.times(origin.unit_cost_iqd));
      remaining = remaining.minus(amount);
    }
    if (remaining.gt(0))
      throw new ConflictException(
        'Return exceeds the quantity issued from inventory',
      );
    if (returnedValue.gt(0))
      await this.ledger.post(tx, {
        sourceType: 'return',
        sourceId: returnId,
        event: `restock:${returnItemId}`,
        documentDate: postingDate,
        accountingDate: postingDate,
        createdBy: actorId,
        description: 'Returned goods restored at original issue cost',
        lines: this.posting('1000', '5000', returnedValue),
      });
    return first;
  }

  private async addValue(
    tx: Tx,
    variantId: string,
    quantity: Prisma.Decimal,
    unitCost: Prisma.Decimal,
  ) {
    await tx.skuCost.upsert({
      where: { variant_id: variantId },
      create: { variant_id: variantId },
      update: {},
    });
    await tx.$queryRaw`SELECT variant_id FROM sku_costs WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
    const current = await tx.skuCost.findUniqueOrThrow({
      where: { variant_id: variantId },
    });
    const nextQuantity = current.book_quantity.plus(quantity);
    const nextValue = current.book_value_iqd.plus(quantity.times(unitCost));
    if (nextQuantity.lt(0) || nextValue.lt(0))
      throw new ConflictException(
        'Inventory cost balance would become negative',
      );
    await tx.skuCost.update({
      where: { variant_id: variantId },
      data: {
        book_quantity: nextQuantity,
        book_value_iqd: nextValue,
        average_cost_iqd: nextQuantity.isZero()
          ? 0
          : nextValue.div(nextQuantity),
        ...(quantity.gt(0) ? { last_landed_cost_iqd: unitCost } : {}),
        updated_at: new Date(),
      },
    });
  }

  private async averageCost(tx: Tx, variantId: string) {
    await tx.$queryRaw`SELECT variant_id FROM sku_costs WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
    const row = await tx.skuCost.findUnique({
      where: { variant_id: variantId },
    });
    if (!row) throw new ConflictException('SKU has no inventory cost record');
    return row.average_cost_iqd;
  }

  private async releaseReservationsForReduction(
    tx: Tx,
    batchId: string,
    locationId: string,
    reduction: Prisma.Decimal,
    actorId: string,
    sourceType: string,
    sourceId: string,
    reference: string,
  ) {
    let remaining = reduction;
    const reservations = await tx.stockReservation.findMany({
      where: { batch_id: batchId, location_id: locationId, status: 'reserved' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    for (const row of reservations) {
      if (remaining.isZero()) break;
      const amount = Prisma.Decimal.min(remaining, row.quantity);
      await tx.stockReservation.update({
        where: { id: row.id },
        data: row.quantity.equals(amount)
          ? { status: 'released', released_at: new Date() }
          : { quantity: row.quantity.minus(amount) },
      });
      await tx.batchStock.update({
        where: {
          batch_id_location_id: { batch_id: batchId, location_id: locationId },
        },
        data: { reserved: { decrement: amount } },
      });
      await tx.order.update({
        where: { id: row.order_id },
        data: { inventory_attention_required: true },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: batchId,
          type: 'release',
          from_location: locationId,
          to_location: locationId,
          quantity: amount,
          reference,
          source_type: sourceType,
          source_id: sourceId,
          user_id: actorId,
        },
      });
      remaining = remaining.minus(amount);
    }
  }

  private lockBalance(tx: Tx, batchId: string, locationId: string) {
    return tx.$queryRaw`SELECT batch_id FROM batch_stock WHERE batch_id = ${batchId}::uuid AND location_id = ${locationId}::uuid FOR UPDATE`;
  }

  private positive(value: string, field: string) {
    const result = D(value);
    if (!result.gt(0))
      throw new UnprocessableEntityException(`${field} must be positive`);
    return result;
  }

  private requireQuantityUnit(
    quantity: Prisma.Decimal,
    wholeUnitsOnly: boolean,
  ) {
    if (wholeUnitsOnly && !quantity.isInteger())
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SKU_WHOLE_UNITS_ONLY',
        message: 'This SKU accepts whole-unit quantities only',
        errors: [],
      });
  }

  private nonNegative(value: string, field: string) {
    const result = D(value);
    if (result.lt(0))
      throw new UnprocessableEntityException(`${field} must be non-negative`);
    return result;
  }

  private isForeignKeyConflict(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2003'
    );
  }

  private posting(debit: string, credit: string, amount: Prisma.Decimal) {
    const value = amount.toFixed(4);
    return [
      {
        accountCode: debit,
        side: 'debit' as const,
        baseAmount: value,
        currencyCode: 'IQD',
        originalAmount: value,
        exchangeRate: '1',
      },
      {
        accountCode: credit,
        side: 'credit' as const,
        baseAmount: value,
        currencyCode: 'IQD',
        originalAmount: value,
        exchangeRate: '1',
      },
    ];
  }

  private requireWarehouse(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } }).then((row) => {
      if (!row) throw new NotFoundException('Warehouse not found');
      return row;
    });
  }

  private presentLot<
    T extends {
      purchase_cost: Prisma.Decimal;
      landed_cost_share: Prisma.Decimal;
      batch_stock: Array<{
        quantity: Prisma.Decimal;
        reserved: Prisma.Decimal;
      }>;
      custody_holdings: Array<{ quantity: Prisma.Decimal }>;
    },
  >(row: T, canViewCost: boolean) {
    const value = {
      ...row,
      custody: row.custody_holdings.reduce(
        (sum, holding) => sum.plus(holding.quantity),
        D(0),
      ),
      batch_stock: row.batch_stock.map((balance) => ({
        ...balance,
        available: balance.quantity.minus(balance.reserved),
      })),
    } as Record<string, unknown>;
    delete value.custody_holdings;
    return canViewCost ? value : this.omitCost(value);
  }

  private omitCost<T extends object>(row: T) {
    const result = { ...row } as Record<string, unknown>;
    delete result.purchase_cost;
    delete result.landed_cost_share;
    delete result.unit_cost_iqd;
    return result;
  }

  private presentDocument(row: unknown, canViewCost: boolean) {
    if (canViewCost) return row;
    const value = { ...(row as Record<string, unknown>) };
    if (Array.isArray(value.lines))
      value.lines = value.lines.map((line) => this.omitCost(line as object));
    return value;
  }

  private async getDocumentTx(
    tx: Tx | PrismaService,
    type: string,
    id: string,
    canViewCost: boolean,
  ): Promise<unknown> {
    let row: unknown;
    if (type === 'opening')
      row = await tx.inventoryOpening.findUnique({
        where: { id },
        include: {
          lines: true,
          journal_entry: { select: { id: true, document_number: true } },
        },
      });
    else if (type === 'transfer')
      row = await tx.stockTransfer.findUnique({
        where: { id },
        include: { lines: true },
      });
    else if (type === 'count')
      row = await tx.stockCount.findUnique({
        where: { id },
        include: {
          lines: true,
          journal_entry: { select: { id: true, document_number: true } },
        },
      });
    else if (type === 'write_down')
      row = await tx.inventoryWriteDown.findUnique({
        where: { id },
        include: {
          lines: true,
          journal_entry: { select: { id: true, document_number: true } },
        },
      });
    else throw new NotFoundException('Inventory document type not found');
    if (!row) throw new NotFoundException('Inventory document not found');
    return this.presentDocument(row, canViewCost);
  }
}
