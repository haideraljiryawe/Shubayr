import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { BrandQueryDto, BrandWriteDto, UpdateBrandDto } from './dto/brand.dto';

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: BrandQueryDto, includeHidden: boolean) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const q = query.q?.trim();
    const where = {
      ...(includeHidden ? {} : { is_visible: true }),
      ...(q
        ? {
            OR: [
              { name_en: { contains: q, mode: 'insensitive' as const } },
              { name_ar: { contains: q, mode: 'insensitive' as const } },
              { slug: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return { page, per_page: perPage, total, data };
  }

  async create(input: BrandWriteDto, actorId: string) {
    if (input.logo_url) await this.media.requireManagedUrl(input.logo_url);
    await this.ensureSlug(input.slug);
    return this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name_en: input.name_en.trim(),
          name_ar: input.name_ar.trim(),
          slug: input.slug,
          logo_url: input.logo_url,
          is_visible: input.is_visible,
          sort_order: input.sort_order,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'catalog.brand.create',
        entityType: 'brand',
        entityId: brand.id,
        after: brand,
      });
      return brand;
    });
  }

  async update(id: string, input: UpdateBrandDto, actorId: string) {
    const current = await this.prisma.brand.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Brand not found');
    if (input.logo_url) await this.media.requireManagedUrl(input.logo_url);
    if (input.slug && input.slug !== current.slug) {
      await this.ensureSlug(input.slug, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.update({
        where: { id },
        data: { ...this.data(input), updated_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'catalog.brand.update',
        entityType: 'brand',
        entityId: id,
        before: current,
        after: brand,
      });
      return brand;
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const current = await this.prisma.brand.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Brand not found');
    const products = await this.prisma.product.count({
      where: { brand_id: id },
    });
    if (products) {
      throw new ConflictException(
        'A brand used by products can only be hidden',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.brand.delete({ where: { id } });
      await this.audit.record(tx, {
        actorId,
        action: 'catalog.brand.delete',
        entityType: 'brand',
        entityId: id,
        before: current,
      });
    });
  }

  private data(input: UpdateBrandDto | BrandWriteDto) {
    return {
      ...(input.name_en === undefined ? {} : { name_en: input.name_en.trim() }),
      ...(input.name_ar === undefined ? {} : { name_ar: input.name_ar.trim() }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.logo_url === undefined ? {} : { logo_url: input.logo_url }),
      ...(input.is_visible === undefined
        ? {}
        : { is_visible: input.is_visible }),
      ...(input.sort_order === undefined
        ? {}
        : { sort_order: input.sort_order }),
    };
  }

  private async ensureSlug(slug: string, excludingId?: string) {
    const match = await this.prisma.brand.findFirst({
      where: { slug, ...(excludingId ? { id: { not: excludingId } } : {}) },
      select: { id: true },
    });
    if (match) throw new ConflictException('Brand slug already exists');
  }
}
