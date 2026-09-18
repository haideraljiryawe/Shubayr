import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import { CategoryQueryDto } from './dto/catalog-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name_en: string;
  name_ar: string;
  slug: string | null;
  description_en: string | null;
  description_ar: string | null;
  image_url: string | null;
  icon_key: string | null;
  sort_order: number;
  is_visible: boolean;
};

type CategoryResponse = CategoryRow & { children: CategoryResponse[] };

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(query: CategoryQueryDto, includeHidden: boolean) {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const allowed = includeHidden
      ? new Set(rows.map(({ id }) => id))
      : this.publicCategoryIds(rows);
    const filtered = rows.filter(({ id }) => allowed.has(id));
    const roots = filtered.filter(({ parent_id }) =>
      query.parent_id ? parent_id === query.parent_id : parent_id === null,
    );
    return roots.map((row) =>
      this.toResponse(row, filtered, query.include_subtree ?? !query.parent_id),
    );
  }

  async create(input: CreateCategoryDto) {
    await this.validateImage(input.image_url);
    const rows = await this.prisma.category.findMany({
      select: { id: true, parent_id: true },
    });
    if (input.parent_id) {
      const depth = this.depthOf(input.parent_id, rows);
      if (depth === null)
        throw new NotFoundException('Parent category not found');
      if (depth >= 4) {
        throw new UnprocessableEntityException(
          'Category depth cannot exceed 4',
        );
      }
    }
    if (input.slug) await this.ensureSlugAvailable(input.slug);

    return this.toResponse(
      await this.prisma.category.create({
        data: {
          name_en: input.name_en.trim(),
          name_ar: input.name_ar.trim(),
          ...(input.parent_id !== undefined
            ? { parent_id: input.parent_id }
            : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description_en !== undefined
            ? { description_en: input.description_en }
            : {}),
          ...(input.description_ar !== undefined
            ? { description_ar: input.description_ar }
            : {}),
          ...(input.image_url !== undefined
            ? { image_url: input.image_url }
            : {}),
          ...(input.icon_key !== undefined ? { icon_key: input.icon_key } : {}),
          ...(input.sort_order !== undefined
            ? { sort_order: input.sort_order }
            : {}),
          ...(input.is_visible !== undefined
            ? { is_visible: input.is_visible }
            : {}),
        },
      }),
      [],
      false,
    );
  }

  async update(id: string, input: UpdateCategoryDto) {
    const rows = await this.prisma.category.findMany();
    const current = rows.find((row) => row.id === id);
    if (!current) throw new NotFoundException('Category not found');
    await this.validateImage(input.image_url);
    if (input.slug && input.slug !== current.slug) {
      await this.ensureSlugAvailable(input.slug, id);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'parent_id')) {
      const descendants = this.descendantIds(id, rows);
      if (
        input.parent_id === id ||
        (input.parent_id && descendants.has(input.parent_id))
      ) {
        throw new ConflictException('Category hierarchy cycle is not allowed');
      }
      const parentDepth = input.parent_id
        ? this.depthOf(input.parent_id, rows)
        : -1;
      if (input.parent_id && parentDepth === null) {
        throw new NotFoundException('Parent category not found');
      }
      const subtreeDepth = this.subtreeDepth(id, rows);
      if ((parentDepth ?? -1) + 1 + subtreeDepth > 4) {
        throw new UnprocessableEntityException(
          'Reparenting would make the category subtree deeper than 4',
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: this.categoryData(input),
    });
    return this.toResponse(updated, [], false);
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    const [children, products] = await this.prisma.$transaction([
      this.prisma.category.count({ where: { parent_id: id } }),
      this.prisma.product.count({ where: { category_id: id } }),
    ]);
    if (children || products) {
      throw new ConflictException(
        'Only leaf categories without products can be deleted',
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }

  private categoryData(input: CreateCategoryDto | UpdateCategoryDto) {
    return {
      ...(input.parent_id !== undefined ? { parent_id: input.parent_id } : {}),
      ...(input.name_en !== undefined ? { name_en: input.name_en.trim() } : {}),
      ...(input.name_ar !== undefined ? { name_ar: input.name_ar.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description_en !== undefined
        ? { description_en: input.description_en }
        : {}),
      ...(input.description_ar !== undefined
        ? { description_ar: input.description_ar }
        : {}),
      ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
      ...(input.icon_key !== undefined ? { icon_key: input.icon_key } : {}),
      ...(input.sort_order !== undefined
        ? { sort_order: input.sort_order }
        : {}),
      ...(input.is_visible !== undefined
        ? { is_visible: input.is_visible }
        : {}),
    };
  }

  private async validateImage(url: string | null | undefined): Promise<void> {
    if (url) await this.media.requireManagedUrl(url);
  }

  private async ensureSlugAvailable(slug: string, excludingId?: string) {
    const match = await this.prisma.category.findFirst({
      where: { slug, ...(excludingId ? { id: { not: excludingId } } : {}) },
      select: { id: true },
    });
    if (match) throw new ConflictException('Category slug already exists');
  }

  private depthOf(
    id: string,
    rows: Array<{ id: string; parent_id: string | null }>,
  ): number | null {
    const byId = new Map(rows.map((row) => [row.id, row]));
    let current = byId.get(id);
    if (!current) return null;
    let depth = 0;
    const visited = new Set<string>();
    while (current.parent_id) {
      if (visited.has(current.id)) {
        throw new ConflictException(
          'Stored category hierarchy contains a cycle',
        );
      }
      visited.add(current.id);
      const parent = byId.get(current.parent_id);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  }

  private descendantIds(
    id: string,
    rows: Array<{ id: string; parent_id: string | null }>,
  ): Set<string> {
    const descendants = new Set<string>();
    let frontier = [id];
    while (frontier.length) {
      const next = rows
        .filter((row) => row.parent_id && frontier.includes(row.parent_id))
        .map((row) => row.id)
        .filter((child) => !descendants.has(child));
      next.forEach((child) => descendants.add(child));
      frontier = next;
    }
    return descendants;
  }

  private subtreeDepth(
    id: string,
    rows: Array<{ id: string; parent_id: string | null }>,
  ): number {
    let maximum = 0;
    let frontier = [id];
    let depth = 0;
    const visited = new Set([id]);
    while (frontier.length) {
      const next = rows
        .filter((row) => row.parent_id && frontier.includes(row.parent_id))
        .map((row) => row.id)
        .filter((child) => !visited.has(child));
      next.forEach((child) => visited.add(child));
      if (next.length) maximum = ++depth;
      frontier = next;
    }
    return maximum;
  }

  private publicCategoryIds(rows: CategoryRow[]): Set<string> {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return new Set(
      rows
        .filter((row) => {
          let current: CategoryRow | undefined = row;
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

  private toResponse(
    row: CategoryRow,
    all: CategoryRow[],
    recursive: boolean,
  ): CategoryResponse {
    const descriptionEn = row.description_en?.trim() || row.description_ar;
    const descriptionAr = row.description_ar?.trim() || row.description_en;
    return {
      ...row,
      description_en: descriptionEn,
      description_ar: descriptionAr,
      children: recursive
        ? all
            .filter(({ parent_id }) => parent_id === row.id)
            .map((child) => this.toResponse(child, all, true))
        : [],
    };
  }
}
