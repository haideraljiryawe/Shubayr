import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.storeSetting.findMany({
      where: {
        key: { in: ['store_name', 'logo_url', 'primary_color', 'currency'] },
      },
    });
    return Object.fromEntries(rows.map(({ key, value }) => [key, value ?? '']));
  }
}
