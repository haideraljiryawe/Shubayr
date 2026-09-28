import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionResolverService {
  private readonly cache = new Map<string, readonly string[]>();

  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, permissionVersion: number): Promise<string[]> {
    const cacheKey = `${userId}:${permissionVersion}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return [...cached];

    const [presets, grants] = await Promise.all([
      this.prisma.userPreset.findMany({
        where: { user_id: userId },
        select: {
          preset: {
            select: {
              permissions: {
                select: { permission: { select: { key: true } } },
              },
            },
          },
        },
      }),
      this.prisma.userPermissionGrant.findMany({
        where: { user_id: userId },
        select: { permission: { select: { key: true } } },
      }),
    ]);
    const permissions = new Set<string>();
    for (const row of presets) {
      for (const item of row.preset.permissions)
        permissions.add(item.permission.key);
    }
    for (const row of grants) permissions.add(row.permission.key);
    const resolved = Object.freeze([...permissions].sort());
    this.cache.set(cacheKey, resolved);
    return [...resolved];
  }

  evictUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) this.cache.delete(key);
    }
  }
}
