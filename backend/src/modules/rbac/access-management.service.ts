import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSION_REGISTRY } from '../../common/access/permission-registry';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import {
  CreatePresetDto,
  CreateStaffDto,
  RegisterWorkPhoneDto,
  PresetListQueryDto,
  SetStaffAccessDto,
  SetStaffPasswordDto,
  UpdatePresetDto,
  UpdateStaffDto,
  StaffListQueryDto,
  WorkPhoneListQueryDto,
} from './dto/access.dto';
import { PermissionResolverService } from './permission-resolver.service';

const staffInclude = {
  permission_presets: { include: { preset: true } },
  permission_grants: { include: { permission: true } },
} as const;

@Injectable()
export class AccessManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
  ) {}

  permissions() {
    return Object.entries(PERMISSION_REGISTRY).map(
      ([key, [group, description]]) => ({ key, group, description }),
    );
  }

  async listStaff(query: StaffListQueryDto) {
    const conditions: Prisma.UserWhereInput[] = [];
    if (query.q) {
      conditions.push({
        OR: [
          { username: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.permission_key) {
      conditions.push({
        OR: [
          {
            permission_grants: {
              some: { permission: { key: query.permission_key } },
            },
          },
          {
            permission_presets: {
              some: {
                preset: {
                  permissions: {
                    some: { permission: { key: query.permission_key } },
                  },
                },
              },
            },
          },
        ],
      });
    }
    const where: Prisma.UserWhereInput = {
      username: { not: null },
      ...(conditions.length ? { AND: conditions } : {}),
      ...(query.status === 'active' ? { is_active: true } : {}),
      ...(query.status === 'inactive' ? { is_active: false } : {}),
      ...(query.status === 'must_change' ? { must_change_password: true } : {}),
      ...(query.preset
        ? { permission_presets: { some: { preset_id: query.preset } } }
        : {}),
    };
    const paginated = Object.values(query).some((value) => value !== undefined);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const direction = query.dir ?? 'asc';
    const sort = query.sort ?? 'name';
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [sort]: direction },
      { id: direction },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: staffInclude,
        orderBy,
        ...(paginated ? { skip: (page - 1) * perPage, take: perPage } : {}),
      }),
      paginated ? this.prisma.user.count({ where }) : Promise.resolve(0),
    ]);
    const data = rows.map((row) => this.presentStaff(row));
    return paginated ? { page, per_page: perPage, total, data } : data;
  }

  async createStaff(actorId: string, input: CreateStaffDto) {
    const passwordHash = await hashPassword(input.password);
    const presetIds = input.preset_ids ?? [];
    const permissions = await this.permissionRows(input.permission_keys ?? []);
    await this.assertPresets(presetIds);
    const row = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          name: input.name,
          email: input.email ?? null,
          password_hash: passwordHash,
          must_change_password: true,
        },
      });
      if (presetIds.length) {
        await tx.userPreset.createMany({
          data: presetIds.map((presetId) => ({
            user_id: user.id,
            preset_id: presetId,
            assigned_by: actorId,
            reason: input.reason,
          })),
        });
      }
      if (permissions.length) {
        await tx.userPermissionGrant.createMany({
          data: permissions.map((permission) => ({
            user_id: user.id,
            permission_id: permission.id,
            granted_by: actorId,
            reason: input.reason,
          })),
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'staff.create',
        entityType: 'user',
        entityId: user.id,
        after: {
          username: user.username,
          preset_ids: presetIds,
          permission_keys: input.permission_keys ?? [],
        },
        reason: input.reason,
      });
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: staffInclude,
      });
    });
    return this.presentStaff(row);
  }

  async updateStaff(actorId: string, userId: string, input: UpdateStaffDto) {
    const initial = await this.staffOrThrow(userId);
    if (actorId === userId && input.is_active === false) {
      throw new ForbiddenException('A staff user cannot deactivate themselves');
    }
    const deactivate = initial.is_active && input.is_active === false;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.is_active !== undefined
            ? { is_active: input.is_active }
            : {}),
          ...(deactivate ? { session_version: { increment: 1 } } : {}),
        },
        include: staffInclude,
      });
      if (deactivate) {
        await tx.refreshToken.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: deactivate ? 'staff.deactivate' : 'staff.update',
        entityType: 'user',
        entityId: userId,
        before: {
          name: initial.name,
          email: initial.email,
          is_active: initial.is_active,
        },
        after: {
          name: updated.name,
          email: updated.email,
          is_active: updated.is_active,
        },
        reason: input.reason,
      });
      return updated;
    });
    return this.presentStaff(row);
  }

  async setPassword(
    actorId: string,
    userId: string,
    input: SetStaffPasswordDto,
  ) {
    await this.staffOrThrow(userId);
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
          must_change_password: true,
          failed_login_attempts: 0,
          locked_until: null,
          session_version: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'staff.password.reset',
        entityType: 'user',
        entityId: userId,
        reason: input.reason,
      });
    });
    return { must_change_password: true };
  }

  async setAccess(actorId: string, userId: string, input: SetStaffAccessDto) {
    const initial = await this.staffOrThrow(userId);
    await this.assertPresets(input.preset_ids);
    const permissions = await this.permissionRows(input.permission_keys);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.userPreset.deleteMany({ where: { user_id: userId } });
      await tx.userPermissionGrant.deleteMany({ where: { user_id: userId } });
      if (input.preset_ids.length) {
        await tx.userPreset.createMany({
          data: input.preset_ids.map((presetId) => ({
            user_id: userId,
            preset_id: presetId,
            assigned_by: actorId,
            reason: input.reason,
          })),
        });
      }
      if (permissions.length) {
        await tx.userPermissionGrant.createMany({
          data: permissions.map((permission) => ({
            user_id: userId,
            permission_id: permission.id,
            granted_by: actorId,
            reason: input.reason,
          })),
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { permission_version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'staff.access.replace',
        entityType: 'user',
        entityId: userId,
        before: {
          preset_ids: initial.permission_presets.map((item) => item.preset_id),
          permission_keys: initial.permission_grants.map(
            (item) => item.permission.key,
          ),
        },
        after: {
          preset_ids: input.preset_ids,
          permission_keys: input.permission_keys,
        },
        reason: input.reason,
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: staffInclude,
      });
    });
    this.resolver.evictUser(userId);
    return this.presentStaff(row);
  }

  async listPresets(query: PresetListQueryDto) {
    const where: Prisma.PermissionPresetWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.kind === 'system' ? { is_system: true } : {}),
      ...(query.kind === 'custom' ? { is_system: false } : {}),
      ...(query.permission_key
        ? {
            permissions: {
              some: { permission: { key: query.permission_key } },
            },
          }
        : {}),
    };
    const paginated = Object.values(query).some((value) => value !== undefined);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const direction = query.dir ?? 'asc';
    const orderBy: Prisma.PermissionPresetOrderByWithRelationInput[] = [
      query.sort === 'permissions'
        ? { permissions: { _count: direction } }
        : { name: direction },
      { id: direction },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.permissionPreset.findMany({
        where,
        include: { permissions: { include: { permission: true } } },
        orderBy,
        ...(paginated ? { skip: (page - 1) * perPage, take: perPage } : {}),
      }),
      paginated
        ? this.prisma.permissionPreset.count({ where })
        : Promise.resolve(0),
    ]);
    const data = rows.map((row) => this.presentPreset(row));
    return paginated ? { page, per_page: perPage, total, data } : data;
  }

  async createPreset(actorId: string, input: CreatePresetDto) {
    const permissions = await this.permissionRows(input.permission_keys);
    return this.prisma.$transaction(async (tx) => {
      const preset = await tx.permissionPreset.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          permissions: {
            create: permissions.map((permission) => ({
              permission_id: permission.id,
            })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'permission_preset.create',
        entityType: 'permission_preset',
        entityId: preset.id,
        after: { name: preset.name, permission_keys: input.permission_keys },
        reason: input.reason,
      });
      return this.presentPreset(preset);
    });
  }

  async updatePreset(
    actorId: string,
    presetId: string,
    input: UpdatePresetDto,
  ) {
    const initial = await this.prisma.permissionPreset.findUnique({
      where: { id: presetId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!initial) throw new NotFoundException('Permission preset not found');
    const permissions =
      input.permission_keys === undefined
        ? undefined
        : await this.permissionRows(input.permission_keys);
    const affected = await this.prisma.userPreset.findMany({
      where: { preset_id: presetId },
      select: { user_id: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      if (permissions) {
        await tx.presetPermission.deleteMany({
          where: { preset_id: presetId },
        });
        if (permissions.length) {
          await tx.presetPermission.createMany({
            data: permissions.map((permission) => ({
              preset_id: presetId,
              permission_id: permission.id,
            })),
          });
        }
      }
      const updated = await tx.permissionPreset.update({
        where: { id: presetId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          updated_at: new Date(),
        },
        include: { permissions: { include: { permission: true } } },
      });
      if (affected.length) {
        await tx.user.updateMany({
          where: { id: { in: affected.map((item) => item.user_id) } },
          data: { permission_version: { increment: 1 } },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'permission_preset.update',
        entityType: 'permission_preset',
        entityId: presetId,
        before: {
          name: initial.name,
          permission_keys: initial.permissions.map(
            (item) => item.permission.key,
          ),
        },
        after: {
          name: updated.name,
          permission_keys: updated.permissions.map(
            (item) => item.permission.key,
          ),
        },
        reason: input.reason,
      });
      return updated;
    });
    for (const user of affected) this.resolver.evictUser(user.user_id);
    return this.presentPreset(row);
  }

  async deletePreset(actorId: string, presetId: string, reason: string) {
    const initial = await this.prisma.permissionPreset.findUnique({
      where: { id: presetId },
    });
    if (!initial) throw new NotFoundException('Permission preset not found');
    if (initial.is_system) {
      throw new ConflictException(
        'System permission presets cannot be deleted',
      );
    }
    const affected = await this.prisma.userPreset.findMany({
      where: { preset_id: presetId },
      select: { user_id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.permissionPreset.delete({ where: { id: presetId } });
      if (affected.length) {
        await tx.user.updateMany({
          where: { id: { in: affected.map((item) => item.user_id) } },
          data: { permission_version: { increment: 1 } },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: 'permission_preset.delete',
        entityType: 'permission_preset',
        entityId: presetId,
        before: { name: initial.name },
        reason,
      });
    });
    for (const user of affected) this.resolver.evictUser(user.user_id);
  }

  async listWorkPhones(query: WorkPhoneListQueryDto) {
    const where: Prisma.WorkProfileWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              {
                user: {
                  phone: { contains: query.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.role ? { app_role: query.role } : {}),
      ...(query.status === 'active' ? { is_active: true } : {}),
      ...(query.status === 'revoked' ? { is_active: false } : {}),
    };
    const paginated = Object.values(query).some((value) => value !== undefined);
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const direction = query.dir ?? 'asc';
    const orderBy: Prisma.WorkProfileOrderByWithRelationInput[] = [
      query.sort === 'phone'
        ? { user: { phone: direction } }
        : query.sort === 'role'
          ? { app_role: direction }
          : { name: direction },
      { id: direction },
    ];
    const [rows, total] = await Promise.all([
      this.prisma.workProfile.findMany({
        where,
        include: { user: { select: { phone: true } } },
        orderBy,
        ...(paginated ? { skip: (page - 1) * perPage, take: perPage } : {}),
      }),
      paginated ? this.prisma.workProfile.count({ where }) : Promise.resolve(0),
    ]);
    const data = rows.map(({ user, ...row }) => ({
      ...row,
      phone: user.phone,
    }));
    return paginated ? { page, per_page: perPage, total, data } : data;
  }

  async registerWorkPhone(actorId: string, input: RegisterWorkPhoneDto) {
    const role = await this.prisma.role.findUnique({
      where: { name: input.role },
    });
    if (!role)
      throw new ConflictException('App-role seed has not been applied');
    const existing = await this.prisma.user.findUnique({
      where: { phone: input.phone },
      include: { role: true, work_profile: true },
    });
    if (existing?.role?.name === 'customer' && !existing.work_profile) {
      throw new ConflictException({
        status: 409,
        code: 'CUSTOMER_PHONE_ALREADY_REGISTERED',
        message: 'A customer phone cannot be converted into a work phone',
        errors: [],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              role_id: role.id,
              is_active: true,
              session_version: { increment: 1 },
            },
          })
        : await tx.user.create({
            data: {
              phone: input.phone,
              name: input.name,
              role_id: role.id,
            },
          });
      const profile = await tx.workProfile.upsert({
        where: { user_id: user.id },
        update: {
          name: input.name,
          app_role: input.role,
          is_active: true,
          updated_at: new Date(),
        },
        create: {
          user_id: user.id,
          name: input.name,
          app_role: input.role,
        },
      });
      await tx.refreshToken.updateMany({
        where: { user_id: user.id, surface: 'app', revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: existing ? 'work_phone.update' : 'work_phone.register',
        entityType: 'work_profile',
        entityId: profile.id,
        before: existing?.work_profile
          ? {
              role: existing.work_profile.app_role,
              active: existing.work_profile.is_active,
            }
          : undefined,
        after: { phone: input.phone, role: input.role, active: true },
        reason: input.reason,
      });
      return { ...profile, phone: input.phone };
    });
  }

  async revokeWorkPhone(actorId: string, phone: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { work_profile: true },
    });
    if (!user?.work_profile)
      throw new NotFoundException('Work phone not found');
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.workProfile.update({
        where: { user_id: user.id },
        data: { is_active: false, updated_at: new Date() },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { role_id: null, session_version: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { user_id: user.id, surface: 'app', revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'work_phone.revoke',
        entityType: 'work_profile',
        entityId: profile.id,
        before: { phone, role: profile.app_role, active: true },
        after: { phone, role: profile.app_role, active: false },
        reason,
      });
    });
  }

  private async staffOrThrow(userId: string) {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, username: { not: null } },
      include: staffInclude,
    });
    if (!row) throw new NotFoundException('Staff user not found');
    return row;
  }

  private async assertPresets(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const count = await this.prisma.permissionPreset.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length)
      throw new NotFoundException('Permission preset not found');
  }

  private async permissionRows(keys: readonly string[]) {
    if (!keys.length) return [];
    const rows = await this.prisma.permission.findMany({
      where: { key: { in: [...keys] } },
    });
    if (rows.length !== keys.length) {
      throw new ConflictException(
        'Permission registry has not been synchronized',
      );
    }
    return rows;
  }

  private presentStaff(
    row: Awaited<ReturnType<AccessManagementService['staffOrThrow']>>,
  ) {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      is_active: row.is_active,
      must_change_password: row.must_change_password,
      permission_version: row.permission_version,
      presets: row.permission_presets.map((item) => ({
        id: item.preset.id,
        name: item.preset.name,
      })),
      extra_grants: row.permission_grants.map((item) => item.permission.key),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private presentPreset(row: {
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    created_at: Date;
    updated_at: Date;
    permissions: Array<{
      permission: { key: string; group: string; description: string | null };
    }>;
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      is_system: row.is_system,
      created_at: row.created_at,
      updated_at: row.updated_at,
      permissions: row.permissions.map((item) => ({
        permission: {
          key: item.permission.key,
          group: item.permission.group,
          description: item.permission.description,
        },
      })),
    };
  }
}
