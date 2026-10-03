import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { businessDateYear } from './business-date';

@Injectable()
export class DocumentNumberService {
  async issue(
    tx: Prisma.TransactionClient,
    documentType: string,
    prefix: string,
    date: Date,
  ): Promise<string> {
    const year = businessDateYear(date);
    const rows = await tx.$queryRaw<Array<{ last_value: number }>>(Prisma.sql`
      INSERT INTO document_sequences (document_type, year, prefix, last_value)
      VALUES (${documentType}, ${year}, ${prefix}, 1)
      ON CONFLICT (document_type, year)
      DO UPDATE SET last_value = document_sequences.last_value + 1,
                    prefix = EXCLUDED.prefix
      RETURNING last_value
    `);
    return `${prefix}-${year}-${String(rows[0].last_value).padStart(6, '0')}`;
  }
}
