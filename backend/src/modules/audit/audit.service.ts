import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { currentClientIp } from './audit-context';

export interface AuditEntry {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
  reason?: string;
}

@Injectable()
export class AuditService {
  record(
    transaction: Pick<Prisma.TransactionClient, 'auditLog'>,
    entry: AuditEntry,
  ) {
    return transaction.auditLog.create({
      data: {
        actor_id: entry.actorId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip ?? currentClientIp(),
        reason: entry.reason,
      },
    });
  }
}
