import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import { BannerQueryDto } from './dto/banner-query.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

type BannerSchedule = {
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
};

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  listPublic(at = new Date()) {
    return this.prisma.banner.findMany({
      where: {
        is_active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: at } }] },
          { OR: [{ ends_at: null }, { ends_at: { gte: at } }] },
        ],
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async listAdmin(query: BannerQueryDto) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.banner.count(),
      this.prisma.banner.findMany({
        skip: (page - 1) * per_page,
        take: per_page,
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { page, per_page, total, data };
  }

  async getAdmin(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async create(input: CreateBannerDto) {
    await this.media.requireManagedUrl(input.image_url);
    this.validateSchedule(input);
    return this.prisma.banner.create({
      data: {
        ...input,
        title: input.title.trim(),
        starts_at: input.starts_at ? new Date(input.starts_at) : null,
        ends_at: input.ends_at ? new Date(input.ends_at) : null,
      },
    });
  }

  async update(id: string, input: UpdateBannerDto) {
    if (Object.keys(input).length === 0) {
      throw new UnprocessableEntityException(
        'PATCH body must contain at least one field',
      );
    }
    const existing = await this.getAdmin(id);
    if (input.image_url !== undefined) {
      await this.media.requireManagedUrl(input.image_url);
    }
    this.validateSchedule({
      starts_at:
        input.starts_at === undefined ? existing.starts_at : input.starts_at,
      ends_at: input.ends_at === undefined ? existing.ends_at : input.ends_at,
    });
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...input,
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.starts_at !== undefined
          ? {
              starts_at: input.starts_at ? new Date(input.starts_at) : null,
            }
          : {}),
        ...(input.ends_at !== undefined
          ? { ends_at: input.ends_at ? new Date(input.ends_at) : null }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getAdmin(id);
    await this.prisma.banner.delete({ where: { id } });
  }

  private validateSchedule(schedule: BannerSchedule): void {
    const starts = schedule.starts_at ? new Date(schedule.starts_at) : null;
    const ends = schedule.ends_at ? new Date(schedule.ends_at) : null;
    if (starts && ends && ends <= starts) {
      throw new UnprocessableEntityException('ends_at must be after starts_at');
    }
  }
}
