import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DeliveryZoneCreateDto,
  DeliveryZonePatchDto,
  DiscountTierCreateDto,
  DiscountTierPatchDto,
  GovernoratePatchDto,
} from './dto/delivery-pricing.dto';
import { conflict } from '../../common/http/api-error';

const zoneInclude = {
  governorates: {
    orderBy: [{ name_en: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.DeliveryZoneInclude;

@Injectable()
export class DeliveryPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublicGovernorates() {
    const rows = await this.prisma.governorate.findMany({
      where: { is_active: true },
      include: { delivery_zone: { select: { is_active: true } } },
      orderBy: [{ name_en: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name_ar: row.name_ar,
      name_en: row.name_en,
      is_active: row.is_active,
      is_served: row.delivery_zone?.is_active === true,
    }));
  }

  async listGovernorates() {
    const rows = await this.prisma.governorate.findMany({
      include: { delivery_zone: true },
      orderBy: [{ name_en: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name_ar: row.name_ar,
      name_en: row.name_en,
      is_active: row.is_active,
      delivery_zone: row.delivery_zone
        ? {
            id: row.delivery_zone.id,
            name_ar: row.delivery_zone.name_ar,
            name_en: row.delivery_zone.name_en,
            fee_iqd: Number(row.delivery_zone.fee_iqd),
            is_active: row.delivery_zone.is_active,
          }
        : null,
    }));
  }

  async updateGovernorate(
    actorId: string,
    id: string,
    input: GovernoratePatchDto,
  ) {
    this.requirePatch(input);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.governorate.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Governorate not found');
      const updated = await tx.governorate.update({
        where: { id },
        data: { ...input, updated_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'governorate.update',
        entityType: 'governorate',
        entityId: id,
        before: this.json(before),
        after: this.json(updated),
      });
      return this.governorate(updated);
    });
  }

  async listZones() {
    const rows = await this.prisma.deliveryZone.findMany({
      include: zoneInclude,
      orderBy: [{ name_en: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.zone(row));
  }

  async createZone(actorId: string, input: DeliveryZoneCreateDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertGovernoratesAvailable(tx, input.governorate_ids);
      const created = await tx.deliveryZone.create({
        data: {
          name_ar: input.name_ar,
          name_en: input.name_en,
          fee_iqd: input.fee_iqd,
          is_active: input.is_active ?? true,
        },
      });
      if (input.governorate_ids.length) {
        await this.assignGovernorates(tx, input.governorate_ids, created.id);
      }
      const after = await tx.deliveryZone.findUniqueOrThrow({
        where: { id: created.id },
        include: zoneInclude,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'delivery_zone.create',
        entityType: 'delivery_zone',
        entityId: created.id,
        after: this.json(this.zone(after)),
      });
      return this.zone(after);
    });
  }

  async updateZone(actorId: string, id: string, input: DeliveryZonePatchDto) {
    this.requirePatch(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM delivery_zones WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.deliveryZone.findUnique({
        where: { id },
        include: zoneInclude,
      });
      if (!before) throw new NotFoundException('Delivery zone not found');
      if (input.governorate_ids) {
        await this.assertGovernoratesAvailable(tx, input.governorate_ids, id);
        await tx.governorate.updateMany({
          where: { delivery_zone_id: id },
          data: { delivery_zone_id: null, updated_at: new Date() },
        });
        if (input.governorate_ids.length) {
          await this.assignGovernorates(tx, input.governorate_ids, id);
        }
      }
      await tx.deliveryZone.update({
        where: { id },
        data: {
          ...(input.name_ar !== undefined ? { name_ar: input.name_ar } : {}),
          ...(input.name_en !== undefined ? { name_en: input.name_en } : {}),
          ...(input.fee_iqd !== undefined ? { fee_iqd: input.fee_iqd } : {}),
          ...(input.is_active !== undefined
            ? { is_active: input.is_active }
            : {}),
          updated_at: new Date(),
        },
      });
      const after = await tx.deliveryZone.findUniqueOrThrow({
        where: { id },
        include: zoneInclude,
      });
      await this.audit.record(tx, {
        actorId,
        action: 'delivery_zone.update',
        entityType: 'delivery_zone',
        entityId: id,
        before: this.json(this.zone(before)),
        after: this.json(this.zone(after)),
      });
      return this.zone(after);
    });
  }

  async deleteZone(actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM delivery_zones WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.deliveryZone.findUnique({
        where: { id },
        include: zoneInclude,
      });
      if (!before) throw new NotFoundException('Delivery zone not found');
      await tx.governorate.updateMany({
        where: { delivery_zone_id: id },
        data: { delivery_zone_id: null, updated_at: new Date() },
      });
      await tx.deliveryZone.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'delivery_zone.delete',
        entityType: 'delivery_zone',
        entityId: id,
        before: this.json(this.zone(before)),
      });
    });
  }

  async listTiers() {
    const rows = await this.prisma.discountTier.findMany({
      orderBy: [{ min_subtotal_iqd: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.tier(row));
  }

  async createTier(actorId: string, input: DiscountTierCreateDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTierThresholdAvailable(tx, input.min_subtotal_iqd);
      const created = await tx.discountTier.create({
        data: {
          min_subtotal_iqd: input.min_subtotal_iqd,
          percent: input.percent,
          is_active: input.is_active ?? true,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'discount_tier.create',
        entityType: 'discount_tier',
        entityId: created.id,
        after: this.json(this.tier(created)),
      });
      return this.tier(created);
    });
  }

  async updateTier(actorId: string, id: string, input: DiscountTierPatchDto) {
    this.requirePatch(input);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.discountTier.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Discount tier not found');
      if (input.min_subtotal_iqd !== undefined) {
        await this.assertTierThresholdAvailable(tx, input.min_subtotal_iqd, id);
      }
      const updated = await tx.discountTier.update({
        where: { id },
        data: { ...input, updated_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'discount_tier.update',
        entityType: 'discount_tier',
        entityId: id,
        before: this.json(this.tier(before)),
        after: this.json(this.tier(updated)),
      });
      return this.tier(updated);
    });
  }

  async deleteTier(actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.discountTier.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Discount tier not found');
      await tx.discountTier.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'discount_tier.delete',
        entityType: 'discount_tier',
        entityId: id,
        before: this.json(this.tier(before)),
      });
    });
  }

  private async assertGovernoratesAvailable(
    tx: Prisma.TransactionClient,
    ids: string[],
    currentZoneId?: string,
  ) {
    const rows = await tx.governorate.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) {
      throw new UnprocessableEntityException('Every governorate_id must exist');
    }
    const conflictRow = rows.find(
      (row) => row.delivery_zone_id && row.delivery_zone_id !== currentZoneId,
    );
    if (conflictRow) {
      throw conflict(
        'GOVERNORATE_ALREADY_IN_DELIVERY_ZONE',
        'A governorate can belong to only one delivery zone',
      );
    }
  }

  private async assertTierThresholdAvailable(
    tx: Prisma.TransactionClient,
    minimum: number,
    currentId?: string,
  ) {
    const existing = await tx.discountTier.findUnique({
      where: { min_subtotal_iqd: minimum },
    });
    if (existing && existing.id !== currentId) {
      throw new ConflictException({
        status: 409,
        code: 'DISCOUNT_TIER_THRESHOLD_EXISTS',
        message: 'A discount tier already uses this minimum subtotal',
        errors: [],
      });
    }
  }

  private async assignGovernorates(
    tx: Prisma.TransactionClient,
    ids: string[],
    zoneId: string,
  ) {
    const assigned = await tx.governorate.updateMany({
      where: {
        id: { in: ids },
        OR: [{ delivery_zone_id: null }, { delivery_zone_id: zoneId }],
      },
      data: { delivery_zone_id: zoneId, updated_at: new Date() },
    });
    if (assigned.count !== ids.length) {
      throw conflict(
        'GOVERNORATE_ALREADY_IN_DELIVERY_ZONE',
        'A governorate can belong to only one delivery zone',
      );
    }
  }

  private requirePatch(input: object) {
    if (!Object.keys(input).length) {
      throw new UnprocessableEntityException('At least one field is required');
    }
  }

  private governorate(row: {
    id: string;
    code: string;
    name_ar: string;
    name_en: string;
    is_active: boolean;
  }) {
    return {
      id: row.id,
      code: row.code,
      name_ar: row.name_ar,
      name_en: row.name_en,
      is_active: row.is_active,
    };
  }

  private zone(
    row: Prisma.DeliveryZoneGetPayload<{ include: typeof zoneInclude }>,
  ) {
    return {
      id: row.id,
      name_ar: row.name_ar,
      name_en: row.name_en,
      fee_iqd: Number(row.fee_iqd),
      is_active: row.is_active,
      governorates: row.governorates.map((entry) => this.governorate(entry)),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private tier(row: {
    id: string;
    min_subtotal_iqd: Prisma.Decimal;
    percent: Prisma.Decimal;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      min_subtotal: Number(row.min_subtotal_iqd),
      percent: Number(row.percent),
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
