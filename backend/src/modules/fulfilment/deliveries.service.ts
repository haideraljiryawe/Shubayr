import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AssignedDeliveriesQueryDto } from './dto/assigned-deliveries-query.dto';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssigned(agentId: string, query: AssignedDeliveriesQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where = {
      agent_id: agentId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({
        where,
        orderBy: [{ dispatched_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return { page, per_page: perPage, total, data };
  }
}
