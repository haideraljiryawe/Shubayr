import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DeliveryParty, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  businessDate,
  businessDateDifference,
  businessDateText,
} from '../finance/business-date';
import {
  CreateExternalDriverDto,
  DeliveryPartyKind,
  DeliveryPartyQueryDto,
  PartyStatementQueryDto,
  UpdateExternalDriverDto,
} from './dto/delivery-party.dto';

const partySelect = {
  id: true,
  kind: true,
  user_id: true,
  name: true,
  phone: true,
  vehicle_number: true,
  description: true,
  notes: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.DeliveryPartySelect;

@Injectable()
export class DeliveryPartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: DeliveryPartyQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const q = query.q?.trim();
    const where: Prisma.DeliveryPartyWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.active === undefined ? {} : { is_active: query.active }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { vehicle_number: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.deliveryParty.count({ where }),
      this.prisma.deliveryParty.findMany({
        where,
        select: partySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return { page, per_page: perPage, total, data: rows };
  }

  async get(id: string) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { id },
      select: partySelect,
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    return party;
  }

  async createExternal(actorId: string, input: CreateExternalDriverDto) {
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.deliveryParty.count({
        where: { phone: input.phone.trim() },
      });
      const party = await tx.deliveryParty.create({
        data: {
          kind: DeliveryPartyKind.ExternalDriver,
          name: input.name.trim(),
          phone: input.phone.trim(),
          vehicle_number: input.vehicle_number?.trim() || null,
          description: input.description?.trim() || null,
          notes: input.notes?.trim() || null,
        },
        select: partySelect,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'external_driver.create',
        entityType: 'delivery_party',
        entityId: party.id,
        after: party,
      });
      return { ...party, duplicate_phone_warning: duplicate > 0 };
    });
  }

  async updateExternal(
    actorId: string,
    id: string,
    input: UpdateExternalDriverDto,
  ) {
    if (!Object.keys(input).length) {
      throw new UnprocessableEntityException(
        'At least one external driver field is required',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryParty.findUnique({ where: { id } });
      this.assertExternal(existing);
      const phone = input.phone?.trim();
      const duplicate = phone
        ? await tx.deliveryParty.count({
            where: { phone, id: { not: id } },
          })
        : 0;
      const party = await tx.deliveryParty.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(phone === undefined ? {} : { phone }),
          ...(input.vehicle_number === undefined
            ? {}
            : { vehicle_number: input.vehicle_number.trim() || null }),
          ...(input.description === undefined
            ? {}
            : { description: input.description.trim() || null }),
          ...(input.notes === undefined
            ? {}
            : { notes: input.notes.trim() || null }),
          ...(input.is_active === undefined
            ? {}
            : { is_active: input.is_active }),
          updated_at: new Date(),
        },
        select: partySelect,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'external_driver.update',
        entityType: 'delivery_party',
        entityId: id,
        before: existing,
        after: party,
      });
      return { ...party, duplicate_phone_warning: duplicate > 0 };
    });
  }

  async removeExternal(actorId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryParty.findUnique({ where: { id } });
      this.assertExternal(existing);
      const [deliveries, movements, holdings, attempts, retrievals] =
        await Promise.all([
          tx.delivery.count({ where: { agent_id: id } }),
          tx.stockMovement.count({ where: { custody_party_id: id } }),
          tx.custodyHolding.count({ where: { custody_party_id: id } }),
          tx.deliveryAttempt.count({ where: { party_id: id } }),
          tx.retrieval.count({ where: { custody_party_id: id } }),
        ]);
      const used =
        deliveries + movements + holdings + attempts + retrievals > 0;
      if (used) {
        await tx.deliveryParty.update({
          where: { id },
          data: { is_active: false, updated_at: new Date() },
        });
      } else {
        await tx.deliveryParty.delete({ where: { id } });
      }
      await this.audit.record(tx, {
        actorId,
        action: used ? 'external_driver.deactivate' : 'external_driver.delete',
        entityType: 'delivery_party',
        entityId: id,
        before: existing,
        after: used ? { is_active: false } : undefined,
      });
      return { id, disposition: used ? 'deactivated' : 'deleted' };
    });
  }

  async custody(id: string, canViewCost: boolean) {
    const party = await this.get(id);
    const rows = await this.prisma.custodyHolding.findMany({
      where: {
        custody_party_id: id,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      include: {
        order: { select: { id: true, order_number: true } },
        batch: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name_en: true, name_ar: true } },
              },
            },
          },
        },
      },
      orderBy: [{ issued_at: 'asc' }, { id: 'asc' }],
    });
    const today = businessDate();
    const goods = rows.map((row) => {
      const quantity = Number(row.remaining_quantity);
      const unitCost = Number(row.unit_cost_iqd);
      return {
        holding_id: row.id,
        order: row.order,
        delivery_id: row.delivery_id,
        batch_id: row.batch_id,
        lot_number: row.batch.lot_number,
        variant_id: row.batch.variant.id,
        sku: row.batch.variant.sku,
        product: row.batch.variant.product,
        quantity,
        issued_at: row.issued_at,
        age_days: businessDateDifference(today, businessDate(row.issued_at)),
        ...(canViewCost
          ? { unit_cost_iqd: unitCost, value_iqd: quantity * unitCost }
          : {}),
      };
    });
    return {
      party,
      goods: {
        quantity: goods.reduce((sum, row) => sum + row.quantity, 0),
        ...(canViewCost
          ? {
              value_iqd: goods.reduce(
                (sum, row) => sum + (row.value_iqd ?? 0),
                0,
              ),
            }
          : {}),
        oldest_age_days: goods.length
          ? Math.max(...goods.map((row) => row.age_days))
          : null,
        lines: goods,
      },
      cash: { currency: 'IQD', amount: 0, oldest_age_days: null },
    };
  }

  async custodyForUser(userId: string) {
    const party = await this.prisma.deliveryParty.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!party) throw new NotFoundException('Delivery party not found');
    return this.custody(party.id, false);
  }

  async statement(
    id: string,
    query: PartyStatementQueryDto,
    canViewCost: boolean,
  ) {
    const party = await this.get(id);
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from must be on or before to');
    }
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        custody_party_id: id,
        type: { in: ['issue_to_custody', 'custody_to_sold', 'return_in'] },
      },
      include: {
        batch: {
          select: { lot_number: true, variant: { select: { sku: true } } },
        },
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    const retrievalIds = movements
      .filter((row) => row.source_type === 'retrieval' && row.source_id)
      .map((row) => row.source_id!);
    const retrievals = retrievalIds.length
      ? await this.prisma.retrieval.findMany({
          where: { id: { in: retrievalIds } },
          select: { id: true, order_id: true },
        })
      : [];
    const retrievalOrders = new Map(
      retrievals.map((row) => [row.id, row.order_id]),
    );
    const orderIds = [
      ...new Set(
        movements
          .map((row) =>
            row.source_type === 'order'
              ? row.source_id
              : row.source_id
                ? retrievalOrders.get(row.source_id)
                : undefined,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const orders = orderIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, order_number: true },
        })
      : [];
    const orderNumbers = new Map(
      orders.map((row) => [row.id, row.order_number]),
    );
    let runningQuantity = 0;
    let runningValue = 0;
    const all = movements.map((row) => {
      const direction = row.type === 'issue_to_custody' ? 1 : -1;
      const quantity = direction * Number(row.quantity);
      const value = quantity * Number(row.unit_cost_iqd);
      runningQuantity += quantity;
      runningValue += value;
      const orderId =
        row.source_type === 'order'
          ? row.source_id
          : row.source_id
            ? (retrievalOrders.get(row.source_id) ?? null)
            : null;
      return {
        id: row.id,
        event: row.type,
        occurred_at: row.created_at,
        business_date: businessDateText(row.created_at),
        order_id: orderId,
        order_number: orderId ? (orderNumbers.get(orderId) ?? null) : null,
        batch_id: row.batch_id,
        lot_number: row.batch.lot_number,
        sku: row.batch.variant.sku,
        quantity,
        running_quantity: runningQuantity,
        ...(canViewCost
          ? { value_iqd: value, running_value_iqd: runningValue }
          : {}),
      };
    });
    const filtered = all.filter(
      (row) =>
        (!query.from || row.business_date >= query.from) &&
        (!query.to || row.business_date <= query.to) &&
        (!query.order_id || row.order_id === query.order_id),
    );
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    return {
      party,
      page,
      per_page: perPage,
      total: filtered.length,
      data: filtered.slice((page - 1) * perPage, page * perPage),
    };
  }

  async heldOrders(id: string) {
    const party = await this.get(id);
    const holdings = await this.prisma.custodyHolding.findMany({
      where: {
        custody_party_id: id,
        status: 'in_custody',
        remaining_quantity: { gt: 0 },
      },
      include: {
        order: { select: { id: true, order_number: true, status: true } },
      },
      orderBy: [{ issued_at: 'asc' }, { id: 'asc' }],
    });
    const grouped = new Map<
      string,
      {
        id: string;
        order_number: string;
        status: string;
        delivery_id: string;
        quantity: number;
        held_since: Date;
        age_days: number;
      }
    >();
    const today = businessDate();
    for (const holding of holdings) {
      const current = grouped.get(holding.order_id);
      const age = businessDateDifference(
        today,
        businessDate(holding.issued_at),
      );
      if (current) {
        current.quantity += Number(holding.remaining_quantity);
        current.age_days = Math.max(current.age_days, age);
        if (holding.issued_at < current.held_since)
          current.held_since = holding.issued_at;
      } else {
        grouped.set(holding.order_id, {
          ...holding.order,
          delivery_id: holding.delivery_id,
          quantity: Number(holding.remaining_quantity),
          held_since: holding.issued_at,
          age_days: age,
        });
      }
    }
    return { party, data: [...grouped.values()] };
  }

  private assertExternal(
    party: DeliveryParty | null,
  ): asserts party is DeliveryParty {
    if (!party || party.kind !== 'external_driver') {
      throw new NotFoundException('External driver not found');
    }
  }
}
