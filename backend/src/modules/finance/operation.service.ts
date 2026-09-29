import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint'
        ? item.toString()
        : item && typeof item === 'object' && 'toJSON' in item
          ? (item as { toJSON(): unknown }).toJSON()
          : item,
    ),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class OperationService {
  constructor(private readonly prisma: PrismaService) {}

  execute<T>(input: {
    userId: string;
    operationId: string;
    endpoint: string;
    payload: unknown;
    responseStatus?: number;
    work: (tx: Prisma.TransactionClient) => Promise<T>;
  }): Promise<T> {
    const payloadHash = createHash('sha256')
      .update(canonical(input.payload))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: string }>>(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${input.operationId}`}))::text AS locked`,
      );
      const existing = await tx.operationRecord.findUnique({
        where: {
          user_id_operation_id: {
            user_id: input.userId,
            operation_id: input.operationId,
          },
        },
      });
      if (existing) {
        if (
          existing.payload_hash !== payloadHash ||
          existing.endpoint !== input.endpoint
        ) {
          throw new ConflictException(
            'The operation id was already used with a different payload',
          );
        }
        if (existing.status === 'completed') return existing.response as T;
        throw new ConflictException('The operation is still processing');
      }
      await tx.operationRecord.create({
        data: {
          user_id: input.userId,
          operation_id: input.operationId,
          endpoint: input.endpoint,
          payload_hash: payloadHash,
        },
      });
      const response = await input.work(tx);
      await tx.operationRecord.update({
        where: {
          user_id_operation_id: {
            user_id: input.userId,
            operation_id: input.operationId,
          },
        },
        data: {
          status: 'completed',
          response_status: input.responseStatus ?? 200,
          response: jsonValue(response),
          completed_at: new Date(),
        },
      });
      return response;
    });
  }

  async outcome(userId: string, operationId: string) {
    const record = await this.prisma.operationRecord.findUnique({
      where: {
        user_id_operation_id: { user_id: userId, operation_id: operationId },
      },
    });
    if (!record) throw new NotFoundException('Operation not found');
    return record;
  }
}
