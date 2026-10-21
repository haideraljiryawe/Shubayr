import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { conflict, invalid } from '../../common/http/api-error';
import { Prisma, type Banner } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import { BannerQueryDto } from './dto/banner-query.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { SwapDefaultBannerDto } from './dto/swap-default-banner.dto';

type BannerSchedule = {
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
};

type BannerActionType = 'none' | 'url' | 'product' | 'category' | 'offers';

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async listPublic(at = new Date()) {
    const eligible = await this.prisma.banner.findMany({
      where: this.usableWhere(at),
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
    const regular = eligible.filter((banner) => !banner.is_default);
    const defaults = eligible
      .filter((banner) => banner.is_default)
      .sort(
        (left, right) =>
          left.default_priority - right.default_priority ||
          left.sort_order - right.sort_order ||
          left.id.localeCompare(right.id),
      );
    const selected =
      regular.length >= 2
        ? regular
        : regular.length === 1
          ? [...regular, ...defaults.slice(0, 1)]
          : defaults.slice(0, 2);
    return this.presentMany(selected, at);
  }

  async listAdmin(query: BannerQueryDto, at = new Date()) {
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
    return {
      page,
      per_page,
      total,
      data: await this.presentMany(data, at, this.prisma, true),
    };
  }

  async getAdmin(id: string, at = new Date()) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return (await this.presentMany([banner], at, this.prisma, true))[0];
  }

  async create(input: CreateBannerDto) {
    await this.media.requireManagedUrl(input.image_url);
    this.validateSchedule(input);
    const action = await this.resolveWriteAction(this.prisma, input);
    const banner = await this.prisma.banner.create({
      data: {
        ...input,
        ...action,
        title: input.title.trim(),
        internal_name: this.clean(input.internal_name),
        title_ar: this.clean(input.title_ar),
        title_en: this.clean(input.title_en),
        subtitle: this.clean(input.subtitle),
        subtitle_ar: this.clean(input.subtitle_ar),
        subtitle_en: this.clean(input.subtitle_en),
        cta_text: this.clean(input.cta_text),
        cta_label_ar: this.clean(input.cta_label_ar),
        cta_label_en: this.clean(input.cta_label_en),
        starts_at: input.starts_at ? new Date(input.starts_at) : null,
        ends_at: input.ends_at ? new Date(input.ends_at) : null,
      },
    });
    return (await this.presentMany([banner], new Date(), this.prisma, true))[0];
  }

  async update(id: string, input: UpdateBannerDto) {
    if (Object.keys(input).length === 0) {
      throw new UnprocessableEntityException(
        'PATCH body must contain at least one field',
      );
    }
    if (input.image_url !== undefined) {
      await this.media.requireManagedUrl(input.image_url);
    }
    const at = new Date();
    const banner = await this.prisma.$transaction(async (tx) => {
      await this.lockDefaults(tx);
      const existing = await tx.banner.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Banner not found');
      this.validateSchedule({
        starts_at:
          input.starts_at === undefined ? existing.starts_at : input.starts_at,
        ends_at: input.ends_at === undefined ? existing.ends_at : input.ends_at,
      });
      const action = await this.resolveWriteAction(tx, input, existing);
      const usableBefore = await tx.banner.count({
        where: { is_default: true, ...this.usableWhere(at) },
      });
      const updated = await tx.banner.update({
        where: { id },
        data: {
          ...input,
          ...action,
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...this.cleanedPatch(input, [
            'internal_name',
            'title_ar',
            'title_en',
            'subtitle',
            'subtitle_ar',
            'subtitle_en',
            'cta_text',
            'cta_label_ar',
            'cta_label_en',
          ]),
          ...(input.starts_at !== undefined
            ? { starts_at: input.starts_at ? new Date(input.starts_at) : null }
            : {}),
          ...(input.ends_at !== undefined
            ? { ends_at: input.ends_at ? new Date(input.ends_at) : null }
            : {}),
        },
      });
      await this.protectDefaultMinimum(tx, usableBefore, at);
      return updated;
    });
    return (await this.presentMany([banner], at, this.prisma, true))[0];
  }

  async reorder(ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.banner.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const actual = stored.map(({ id }) => id).sort();
      const requested = [...ids].sort();
      if (
        actual.length !== requested.length ||
        actual.some((id, index) => id !== requested[index])
      ) {
        throw invalid(
          'BANNER_ORDER_IDS_INVALID',
          'Banner order must contain every banner id exactly once',
        );
      }
      for (const [sort_order, id] of ids.entries()) {
        await tx.banner.update({ where: { id }, data: { sort_order } });
      }
      const rows = await tx.banner.findMany({
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      });
      return this.presentMany(rows, new Date(), tx, true);
    });
  }

  async swapDefault(input: SwapDefaultBannerDto) {
    if (input.outgoing_id === input.incoming_id) {
      throw invalid(
        'BANNER_DEFAULT_SWAP_INVALID',
        'Outgoing and incoming banners must be different',
      );
    }
    const at = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockDefaults(tx);
      const [outgoing, incoming] = await Promise.all([
        tx.banner.findUnique({ where: { id: input.outgoing_id } }),
        tx.banner.findUnique({ where: { id: input.incoming_id } }),
      ]);
      if (!outgoing || !incoming)
        throw new NotFoundException('Banner not found');
      if (!outgoing.is_default || incoming.is_default) {
        throw invalid(
          'BANNER_DEFAULT_SWAP_INVALID',
          'Swap requires one current default and one non-default banner',
        );
      }
      if (!this.isUsable(incoming, at)) {
        throw invalid(
          'BANNER_DEFAULT_REPLACEMENT_NOT_USABLE',
          'The replacement default banner must be active and within its schedule',
        );
      }
      await tx.banner.update({
        where: { id: outgoing.id },
        data: { is_default: false },
      });
      await tx.banner.update({
        where: { id: incoming.id },
        data: {
          is_default: true,
          default_priority: input.default_priority ?? outgoing.default_priority,
        },
      });
      const rows = await tx.banner.findMany({
        where: { id: { in: [outgoing.id, incoming.id] } },
        orderBy: [{ default_priority: 'asc' }, { id: 'asc' }],
      });
      return this.presentMany(rows, at, tx, true);
    });
  }

  async remove(id: string): Promise<void> {
    const at = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lockDefaults(tx);
      const existing = await tx.banner.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Banner not found');
      const usableBefore = await tx.banner.count({
        where: { is_default: true, ...this.usableWhere(at) },
      });
      await tx.banner.delete({ where: { id } });
      await this.protectDefaultMinimum(tx, usableBefore, at);
    });
  }

  private async presentMany(
    banners: Banner[],
    at: Date,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
    rawAdmin = false,
  ) {
    const productIds = banners
      .filter((banner) => banner.action_type === 'product')
      .flatMap((banner) =>
        banner.action_target_id ? [banner.action_target_id] : [],
      );
    const categoryIds = banners
      .filter((banner) => banner.action_type === 'category')
      .flatMap((banner) =>
        banner.action_target_id ? [banner.action_target_id] : [],
      );
    const [products, categories, allCategories, usableDefaultCount] =
      await Promise.all([
        db.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category_id: true,
            name_ar: true,
            name_en: true,
            status: true,
            published_at: true,
          },
        }),
        db.category.findMany({
          where: { id: { in: categoryIds } },
          select: {
            id: true,
            parent_id: true,
            slug: true,
            name_ar: true,
            name_en: true,
            is_visible: true,
          },
        }),
        db.category.findMany({
          select: { id: true, parent_id: true, is_visible: true },
        }),
        rawAdmin
          ? db.banner.count({
              where: { is_default: true, ...this.usableWhere(at) },
            })
          : Promise.resolve(0),
      ]);
    const visibleCategories = this.visibleCategoryIds(allCategories);
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    return banners.map((banner) => {
      const type = banner.action_type as BannerActionType;
      const product =
        type === 'product' && banner.action_target_id
          ? productById.get(banner.action_target_id)
          : undefined;
      const category =
        type === 'category' && banner.action_target_id
          ? categoryById.get(banner.action_target_id)
          : undefined;
      const target = product
        ? {
            id: product.id,
            slug: null,
            name_ar: product.name_ar,
            name_en: product.name_en,
            available:
              product.status === 'active' &&
              product.published_at !== null &&
              visibleCategories.has(product.category_id),
          }
        : category
          ? {
              id: category.id,
              slug: category.slug,
              name_ar: category.name_ar,
              name_en: category.name_en,
              available: visibleCategories.has(category.id),
            }
          : null;
      return {
        ...banner,
        internal_name: this.clean(banner.internal_name) ?? banner.title,
        title_ar: rawAdmin
          ? this.clean(banner.title_ar)
          : (this.clean(banner.title_ar) ??
            this.clean(banner.title_en) ??
            banner.title),
        title_en: rawAdmin
          ? this.clean(banner.title_en)
          : (this.clean(banner.title_en) ??
            this.clean(banner.title_ar) ??
            banner.title),
        subtitle_ar: rawAdmin
          ? this.clean(banner.subtitle_ar)
          : (this.clean(banner.subtitle_ar) ??
            this.clean(banner.subtitle_en) ??
            this.clean(banner.subtitle)),
        subtitle_en: rawAdmin
          ? this.clean(banner.subtitle_en)
          : (this.clean(banner.subtitle_en) ??
            this.clean(banner.subtitle_ar) ??
            this.clean(banner.subtitle)),
        cta_label_ar: rawAdmin
          ? this.clean(banner.cta_label_ar)
          : (this.clean(banner.cta_label_ar) ??
            this.clean(banner.cta_label_en) ??
            this.clean(banner.cta_text)),
        cta_label_en: rawAdmin
          ? this.clean(banner.cta_label_en)
          : (this.clean(banner.cta_label_en) ??
            this.clean(banner.cta_label_ar) ??
            this.clean(banner.cta_text)),
        effective_status: this.effectiveStatus(banner, at),
        action: {
          type,
          url: type === 'url' ? banner.link_url : null,
          target,
        },
        ...(rawAdmin
          ? {
              removal: {
                allowed: !(
                  banner.is_default &&
                  this.isUsable(banner, at) &&
                  usableDefaultCount <= 2
                ),
                reason_code:
                  banner.is_default &&
                  this.isUsable(banner, at) &&
                  usableDefaultCount <= 2
                    ? 'BANNER_DEFAULT_MINIMUM_REQUIRED'
                    : null,
              },
            }
          : {}),
      };
    });
  }

  private async resolveWriteAction(
    db: PrismaService | Prisma.TransactionClient,
    input: CreateBannerDto | UpdateBannerDto,
    existing?: Banner,
  ): Promise<{
    action_type: BannerActionType;
    action_target_id: string | null;
    link_url: string | null;
  }> {
    const legacyLinkChanged = Object.prototype.hasOwnProperty.call(
      input,
      'link_url',
    );
    const type = (input.action_type ??
      (legacyLinkChanged
        ? input.link_url
          ? 'url'
          : 'none'
        : (existing?.action_type ??
          (input.link_url ? 'url' : 'none')))) as BannerActionType;
    const targetId = input.action_type
      ? (input.action_target_id ?? null)
      : legacyLinkChanged
        ? null
        : input.action_target_id === undefined
          ? (existing?.action_target_id ?? null)
          : input.action_target_id;
    const linkUrl =
      type === 'url'
        ? input.link_url === undefined
          ? (existing?.link_url ?? null)
          : input.link_url
        : null;

    if (type === 'url' && !linkUrl) {
      throw invalid(
        'BANNER_ACTION_URL_REQUIRED',
        'URL actions require link_url',
      );
    }
    if ((type === 'product' || type === 'category') && !targetId) {
      throw invalid(
        'BANNER_ACTION_TARGET_REQUIRED',
        `${type} actions require action_target_id`,
      );
    }
    if ((type === 'none' || type === 'offers' || type === 'url') && targetId) {
      throw invalid(
        'BANNER_ACTION_TARGET_NOT_ALLOWED',
        `${type} actions do not accept action_target_id`,
      );
    }
    if (type === 'product' && targetId) {
      const target = await db.product.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!target)
        throw invalid(
          'BANNER_ACTION_TARGET_NOT_FOUND',
          'Banner product target was not found',
        );
    }
    if (type === 'category' && targetId) {
      const target = await db.category.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!target)
        throw invalid(
          'BANNER_ACTION_TARGET_NOT_FOUND',
          'Banner category target was not found',
        );
    }
    return { action_type: type, action_target_id: targetId, link_url: linkUrl };
  }

  private effectiveStatus(banner: Banner, at: Date) {
    if (!banner.is_active) return 'disabled';
    if (banner.starts_at && banner.starts_at > at) return 'scheduled';
    if (banner.ends_at && banner.ends_at < at) return 'expired';
    return 'active';
  }

  private usableWhere(at: Date): Prisma.BannerWhereInput {
    return {
      is_active: true,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: at } }] },
        { OR: [{ ends_at: null }, { ends_at: { gte: at } }] },
      ],
    };
  }

  private isUsable(banner: Banner, at: Date) {
    return (
      banner.is_active &&
      (!banner.starts_at || banner.starts_at <= at) &&
      (!banner.ends_at || banner.ends_at >= at)
    );
  }

  private async protectDefaultMinimum(
    tx: Prisma.TransactionClient,
    usableBefore: number,
    at: Date,
  ) {
    if (usableBefore < 2) return;
    const usableAfter = await tx.banner.count({
      where: { is_default: true, ...this.usableWhere(at) },
    });
    if (usableAfter < 2) {
      throw conflict(
        'BANNER_DEFAULT_MINIMUM_REQUIRED',
        'At least two usable default banners must remain',
      );
    }
  }

  private async lockDefaults(tx: Prisma.TransactionClient) {
    // $executeRaw deliberately discards the SELECT result. PostgreSQL's
    // advisory-lock function returns void, which Prisma cannot deserialize
    // through $queryRaw even though the lock itself succeeds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('banners.defaults'))`;
  }

  private visibleCategoryIds(
    rows: Array<{ id: string; parent_id: string | null; is_visible: boolean }>,
  ) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return new Set(
      rows
        .filter((row) => {
          let current: (typeof rows)[number] | undefined = row;
          const visited = new Set<string>();
          while (current) {
            if (!current.is_visible || visited.has(current.id)) return false;
            visited.add(current.id);
            current = current.parent_id
              ? byId.get(current.parent_id)
              : undefined;
          }
          return true;
        })
        .map(({ id }) => id),
    );
  }

  private cleanedPatch(input: object, fields: string[]) {
    const record = input as Record<string, unknown>;
    return Object.fromEntries(
      fields
        .filter((field) => Object.prototype.hasOwnProperty.call(record, field))
        .map((field) => [field, this.clean(record[field] as string | null)]),
    );
  }

  private clean(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private validateSchedule(schedule: BannerSchedule): void {
    const starts = schedule.starts_at ? new Date(schedule.starts_at) : null;
    const ends = schedule.ends_at ? new Date(schedule.ends_at) : null;
    if (starts && ends && ends <= starts) {
      throw new UnprocessableEntityException('ends_at must be after starts_at');
    }
  }
}
