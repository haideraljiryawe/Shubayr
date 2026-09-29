import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AdminSettingsUpdateDto } from './dto/admin-settings.dto';

const MANAGED_KEYS = new Set([
  'store_name',
  'store_address',
  'store_phone',
  'logo_url',
  'primary_color',
  'delivery_fee',
  'timezone',
  'acceptance_alert_timeout_minutes',
  'auto_cancel_enabled',
  'auto_cancel_timeout_minutes',
  'auto_cancel_warning_minutes',
  'default_low_stock_threshold',
  'backdating_window_days',
  'markup_alert_percent',
]);

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && 'toJSON' in item
        ? (item as { toJSON(): unknown }).toJSON()
        : item,
    ),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPublicSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.storeSetting.findMany({
      where: {
        key: { in: ['store_name', 'logo_url', 'primary_color', 'currency'] },
      },
    });
    return Object.fromEntries(rows.map(({ key, value }) => [key, value ?? '']));
  }

  async getAdminSettings() {
    const [settings, businessHours, closedDays, thresholds] = await Promise.all(
      [
        this.prisma.storeSetting.findMany({ orderBy: { key: 'asc' } }),
        this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
        this.prisma.closedDay.findMany({ orderBy: { date: 'asc' } }),
        this.prisma.protectionThreshold.findMany({ orderBy: { key: 'asc' } }),
      ],
    );
    return {
      settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
      business_hours: businessHours,
      closed_days: closedDays,
      protection_thresholds: Object.fromEntries(
        thresholds.map((row) => [row.key, row.percent]),
      ),
    };
  }

  async updateAdminSettings(actorId: string, input: AdminSettingsUpdateDto) {
    for (const key of Object.keys(input.settings ?? {})) {
      if (!MANAGED_KEYS.has(key)) {
        throw new UnprocessableEntityException(`Unknown setting: ${key}`);
      }
    }
    const before = await this.getAdminSettings();
    const hoursByWeekday = new Map(
      before.business_hours.map((row) => [row.weekday, row]),
    );
    for (const row of input.business_hours ?? []) {
      hoursByWeekday.set(row.weekday, {
        ...hoursByWeekday.get(row.weekday),
        ...row,
      } as (typeof before.business_hours)[number]);
    }
    const after = {
      settings: { ...before.settings, ...(input.settings ?? {}) },
      business_hours: [...hoursByWeekday.values()].sort(
        (left, right) => left.weekday - right.weekday,
      ),
      closed_days: input.closed_days ?? before.closed_days,
      protection_thresholds: {
        ...before.protection_thresholds,
        ...(input.protection_thresholds ?? {}),
      },
    };
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(input.settings ?? {})) {
        await tx.storeSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value, updated_at: new Date() },
        });
      }
      for (const row of input.business_hours ?? []) {
        if (
          !Number.isInteger(row.weekday) ||
          row.weekday < 0 ||
          row.weekday > 6
        ) {
          throw new UnprocessableEntityException(
            'Weekday must be between 0 and 6',
          );
        }
        await tx.businessHour.upsert({
          where: { weekday: row.weekday },
          create: row,
          update: { ...row, updated_at: new Date() },
        });
      }
      if (input.closed_days) {
        await tx.closedDay.deleteMany();
        if (input.closed_days.length) {
          await tx.closedDay.createMany({
            data: input.closed_days.map((row) => ({
              date: new Date(`${row.date}T00:00:00.000Z`),
              reason: row.reason,
            })),
          });
        }
      }
      for (const [key, percent] of Object.entries(
        input.protection_thresholds ?? {},
      )) {
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
          throw new UnprocessableEntityException(
            'Protection thresholds must be whole percentages from 0 to 100',
          );
        }
        await tx.protectionThreshold.upsert({
          where: { key },
          create: { key, percent },
          update: { percent, updated_at: new Date() },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'settings.update',
        entityType: 'settings',
        before: jsonValue(before),
        after: jsonValue(after),
      });
    });
    return this.getAdminSettings();
  }
}
