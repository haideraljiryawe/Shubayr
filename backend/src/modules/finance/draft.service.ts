import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DraftService {
  constructor(private readonly prisma: PrismaService) {}

  save(userId: string, documentType: string, payload: Prisma.InputJsonObject) {
    return this.prisma.documentDraft.upsert({
      where: {
        user_id_document_type: {
          user_id: userId,
          document_type: documentType,
        },
      },
      update: { payload, updated_at: new Date() },
      create: {
        user_id: userId,
        document_type: documentType,
        payload,
      },
    });
  }

  list(userId: string) {
    return this.prisma.documentDraft.findMany({
      where: { user_id: userId },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });
  }

  async get(userId: string, documentType: string) {
    const draft = await this.prisma.documentDraft.findUnique({
      where: {
        user_id_document_type: {
          user_id: userId,
          document_type: documentType,
        },
      },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  async discard(userId: string, documentType: string) {
    await this.get(userId, documentType);
    await this.prisma.documentDraft.delete({
      where: {
        user_id_document_type: {
          user_id: userId,
          document_type: documentType,
        },
      },
    });
  }
}
