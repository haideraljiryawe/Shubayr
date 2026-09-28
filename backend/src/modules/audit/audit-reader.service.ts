import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const actorConditions: Prisma.AuditLogWhereInput[] = query.actor
      ? [
          ...(this.isUuid(query.actor) ? [{ actor_id: query.actor }] : []),
          {
            actor: {
              OR: [
                {
                  username: {
                    contains: query.actor,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  name: {
                    contains: query.actor,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          },
        ]
      : [];
    const where: Prisma.AuditLogWhereInput = {
      ...(actorConditions.length ? { OR: actorConditions } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity_type ? { entity_type: query.entity_type } : {}),
      ...(query.entity_id ? { entity_id: query.entity_id } : {}),
      ...(query.from || query.to
        ? {
            created_at: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, username: true, name: true } },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { page, per_page: perPage, total, data: rows };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
