import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  criticalPair,
  defaultEnabled,
  message,
  bilingualMessage,
  normalizedLocale,
  notificationChannels,
  notificationTypes,
} from './notification-types';
import type {
  NotificationChannel,
  NotificationType,
} from './notification-types';
import type { NotificationProvider } from './notification-provider';
import { PUSH_PROVIDER, SMS_PROVIDER } from './notification-provider';
import {
  NotificationHistoryQueryDto,
  PatchPreferencesDto,
  RegisterDeviceDto,
} from './dto/notification.dto';

@Injectable()
export class NotificationsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private pumping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject('BullQueue_notifications') private readonly queue: Queue,
    @Inject(PUSH_PROVIDER) private readonly push: NotificationProvider,
    @Inject(SMS_PROVIDER) private readonly sms: NotificationProvider,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.enqueuePending(), 1000);
    this.timer.unref();
    void this.enqueuePending();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Transactional outbox: the request writes only PostgreSQL, never waits for Redis. */
  record(
    tx: Prisma.TransactionClient,
    userId: string,
    type: NotificationType,
    entityType: string,
    entityId: string,
    suffix = '',
    targetRole:
      'customer' | 'delivery_agent' | 'order_monitor' | 'staff' = 'customer',
    deepLinkOverride?: string,
  ) {
    const eventKey = `${type}:${entityType}:${entityId}:${suffix}`;
    const content = bilingualMessage(type);
    const deepLink =
      deepLinkOverride ?? this.deepLink(targetRole, entityType, entityId);
    return this.createInboxEvent(tx, {
      eventKey,
      userId,
      type,
      targetRole,
      entityType,
      entityId,
      deepLink,
      content,
    });
  }

  private async createInboxEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventKey: string;
      userId: string;
      type: NotificationType;
      targetRole: 'customer' | 'delivery_agent' | 'order_monitor' | 'staff';
      entityType: string;
      entityId: string;
      deepLink: string;
      content: ReturnType<typeof bilingualMessage>;
    },
  ) {
    // Serialize inbox mutations per recipient so emitted unread counts always
    // reflect the committed order of arrivals and read-state changes.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
    const created = await tx.notificationEvent.createMany({
      data: [
        {
          event_key: input.eventKey,
          user_id: input.userId,
          type: input.type,
          target_role: input.targetRole,
          entity_type: input.entityType,
          entity_id: input.entityId,
          ...input.content,
          deep_link: input.deepLink,
        },
      ],
      skipDuplicates: true,
    });
    if (!created.count) return created;
    const notification = await tx.notificationEvent.findUniqueOrThrow({
      where: {
        event_key_user_id: { event_key: input.eventKey, user_id: input.userId },
      },
    });
    const unreadCount = await tx.notificationEvent.count({
      where: { user_id: input.userId, read_at: null },
    });
    await tx.notificationStreamEvent.createMany({
      data: [
        {
          user_id: input.userId,
          notification_id: notification.id,
          event: 'notification.created',
          data: this.inboxItem(notification),
        },
        {
          user_id: input.userId,
          notification_id: notification.id,
          event: 'unread.count',
          data: { unread_count: unreadCount },
        },
      ],
    });
    return created;
  }

  async recordOrderMonitors(
    tx: Prisma.TransactionClient,
    type: 'new_order' | 'order_cancelled' | 'delivery_failed',
    orderId: string,
    suffix = '',
  ) {
    const monitors = await tx.user.findMany({
      where: {
        is_active: true,
        role: { is: { name: 'order_monitor' } },
        work_profile: { is: { app_role: 'order_monitor', is_active: true } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const monitor of monitors) {
      await this.record(
        tx,
        monitor.id,
        type,
        'order',
        orderId,
        suffix,
        'order_monitor',
      );
    }
  }

  private deepLink(role: string, entityType: string, entityId: string) {
    if (entityType === 'order') {
      if (role === 'order_monitor') return `/monitor/orders/${entityId}`;
      if (role === 'staff') return `/admin/orders/${entityId}`;
      return `/orders/${entityId}`;
    }
    if (entityType === 'delivery') return `/deliveries/${entityId}`;
    return '/notifications';
  }

  async enqueuePending() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      const pending = await this.prisma.notificationEvent.findMany({
        where: { enqueued_at: null, processed_at: null },
        orderBy: { created_at: 'asc' },
        take: 100,
      });
      for (const event of pending) {
        try {
          await this.queue.add(
            'fanout',
            { eventId: event.id },
            {
              jobId: event.id,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: { count: 10000 },
              removeOnFail: false,
            },
          );
          await this.prisma.notificationEvent.updateMany({
            where: { id: event.id, enqueued_at: null },
            data: { enqueued_at: new Date() },
          });
        } catch (error) {
          this.logger.warn(
            `Could not enqueue notification event ${event.id}: ${String(error)}`,
          );
          break;
        }
      }
    } catch (error) {
      this.logger.warn(`Notification outbox scan failed: ${String(error)}`);
    } finally {
      this.pumping = false;
    }
  }

  async register(userId: string, input: RegisterDeviceDto) {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.deviceToken.findUnique({
        where: { token: input.token },
      });
      const row = await tx.deviceToken.upsert({
        where: { token: input.token },
        create: {
          user_id: userId,
          token: input.token,
          platform: input.platform,
          locale: input.locale ?? null,
          last_seen_at: new Date(),
        },
        update: {
          user_id: userId,
          platform: input.platform,
          locale: input.locale ?? null,
          is_active: true,
          deactivated_at: null,
          last_seen_at: new Date(),
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'device_token.register',
        entityType: 'device_token',
        entityId: row.id,
        before: prior
          ? { user_id: prior.user_id, is_active: prior.is_active }
          : undefined,
        after: { user_id: userId, platform: row.platform, is_active: true },
      });
      return row;
    });
  }

  async unregister(userId: string, token: string) {
    await this.prisma.$transaction(async (tx) => {
      const prior = await tx.deviceToken.findUnique({ where: { token } });
      if (!prior) throw new NotFoundException('Device token not found');
      if (prior.user_id !== userId)
        throw new ForbiddenException('Device token belongs to another account');
      const updated = await tx.deviceToken.updateMany({
        where: { id: prior.id, user_id: userId },
        data: { is_active: false, deactivated_at: new Date() },
      });
      if (!updated.count)
        throw new ForbiddenException('Device token belongs to another account');
      await this.audit.record(tx, {
        actorId: userId,
        action: 'device_token.unregister',
        entityType: 'device_token',
        entityId: prior.id,
        before: { is_active: prior.is_active },
        after: { is_active: false },
      });
    });
  }

  async preferences(userId: string) {
    const [legacy, overrides] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: { user_id: userId },
      }),
      this.prisma.notificationChannelPreference.findMany({
        where: { user_id: userId },
      }),
    ]);
    return {
      preferences: notificationTypes.flatMap((type) =>
        notificationChannels.map((channel) => ({
          type,
          channel,
          enabled:
            criticalPair(type, channel) ||
            (overrides.find(
              (item) => item.type === type && item.channel === channel,
            )?.enabled ??
              defaultEnabled(type, channel, legacy)),
        })),
      ),
    };
  }

  async patchPreferences(userId: string, input: PatchPreferencesDto) {
    const keys = input.preferences.map(
      (item) => `${item.type}:${item.channel}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new UnprocessableEntityException(
        'Duplicate type/channel preference',
      );
    if (
      input.preferences.some(
        (item) => criticalPair(item.type, item.channel) && !item.enabled,
      )
    )
      throw new UnprocessableEntityException(
        'Order confirmation SMS is required',
      );
    await this.prisma.$transaction(async (tx) => {
      for (const item of input.preferences) {
        const old = await tx.notificationChannelPreference.findUnique({
          where: {
            user_id_type_channel: {
              user_id: userId,
              type: item.type,
              channel: item.channel,
            },
          },
        });
        await tx.notificationChannelPreference.upsert({
          where: {
            user_id_type_channel: {
              user_id: userId,
              type: item.type,
              channel: item.channel,
            },
          },
          create: {
            user_id: userId,
            type: item.type,
            channel: item.channel,
            enabled: item.enabled,
          },
          update: { enabled: item.enabled, updated_at: new Date() },
        });
        await this.audit.record(tx, {
          actorId: userId,
          action: 'notification_preference.update',
          entityType: 'notification_preference',
          entityId: userId,
          before: {
            type: item.type,
            channel: item.channel,
            enabled: old?.enabled ?? null,
          },
          after: {
            type: item.type,
            channel: item.channel,
            enabled: item.enabled,
          },
        });
      }
    });
    return this.preferences(userId);
  }

  async history(userId: string, query: NotificationHistoryQueryDto) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.notificationEvent.count({
        where: { user_id: userId, ...(query.unread ? { read_at: null } : {}) },
      }),
      this.prisma.notificationEvent.findMany({
        where: { user_id: userId, ...(query.unread ? { read_at: null } : {}) },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * per_page,
        take: per_page,
        select: {
          id: true,
          type: true,
          target_role: true,
          title_ar: true,
          body_ar: true,
          title_en: true,
          body_en: true,
          deep_link: true,
          read_at: true,
          entity_type: true,
          entity_id: true,
          created_at: true,
        },
      }),
    ]);
    return { page, per_page, total, data };
  }

  async unreadCount(userId: string) {
    return {
      unread_count: await this.prisma.notificationEvent.count({
        where: { user_id: userId, read_at: null },
      }),
    };
  }

  async markRead(userId: string, notificationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const [notification] = await tx.$queryRaw<
        Array<{ id: string; read_at: Date | null }>
      >`SELECT id, read_at
        FROM notification_events
        WHERE id = ${notificationId}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE`;
      if (!notification) throw new NotFoundException('Notification not found');
      const readAt = notification.read_at ?? new Date();
      if (!notification.read_at) {
        await tx.notificationEvent.update({
          where: { id: notification.id },
          data: { read_at: readAt },
        });
        await this.recordReadEvents(
          tx,
          userId,
          [notification.id],
          readAt,
          notification.id,
        );
      }
      return { id: notification.id, read_at: readAt };
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const unread = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM notification_events
        WHERE user_id = ${userId}::uuid AND read_at IS NULL
        ORDER BY id
        FOR UPDATE`;
      const readAt = new Date();
      if (unread.length) {
        await tx.notificationEvent.updateMany({
          where: { user_id: userId, read_at: null },
          data: { read_at: readAt },
        });
        await this.recordReadEvents(
          tx,
          userId,
          unread.map((item) => item.id),
          readAt,
        );
      }
      return { updated: unread.length, read_at: readAt };
    });
  }

  private async recordReadEvents(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[],
    readAt: Date,
    notificationId?: string,
  ) {
    const data = {
      notification_ids: ids,
      read_at: readAt.toISOString(),
      unread_count: 0,
    };
    const unreadCount = await tx.notificationEvent.count({
      where: { user_id: userId, read_at: null },
    });
    data.unread_count = unreadCount;
    await tx.notificationStreamEvent.createMany({
      data: [
        {
          user_id: userId,
          notification_id: notificationId,
          event: 'notification.read',
          data,
        },
        {
          user_id: userId,
          notification_id: notificationId,
          event: 'unread.count',
          data: { unread_count: unreadCount },
        },
      ],
    });
  }

  private inboxItem(notification: {
    id: string;
    type: string;
    target_role: string;
    title_ar: string;
    body_ar: string;
    title_en: string;
    body_en: string;
    deep_link: string;
    entity_type: string;
    entity_id: string;
    created_at: Date;
    read_at: Date | null;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      target_role: notification.target_role,
      title_ar: notification.title_ar,
      body_ar: notification.body_ar,
      title_en: notification.title_en,
      body_en: notification.body_en,
      deep_link: notification.deep_link,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      created_at: notification.created_at.toISOString(),
      read_at: notification.read_at?.toISOString() ?? null,
    };
  }

  async dispatch(eventId: string) {
    const event = await this.prisma.notificationEvent.findUnique({
      where: { id: eventId },
      include: { user: true },
    });
    if (!event || event.processed_at) return;
    const type = event.type as NotificationType;
    if (!notificationTypes.includes(type))
      throw new ConflictException('Unknown notification type');
    const [tokens, legacy, overrides] = await Promise.all([
      this.prisma.deviceToken.findMany({
        where: { user_id: event.user_id, is_active: true },
        orderBy: { last_seen_at: 'desc' },
      }),
      this.prisma.notificationPreference.findUnique({
        where: { user_id: event.user_id },
      }),
      this.prisma.notificationChannelPreference.findMany({
        where: { user_id: event.user_id, type },
      }),
    ]);
    for (const channel of notificationChannels) {
      const enabled =
        criticalPair(type, channel) ||
        (overrides.find((row) => row.channel === channel)?.enabled ??
          defaultEnabled(type, channel, legacy));
      const targets =
        channel === 'push'
          ? tokens.map((token) => ({
              key: token.id,
              recipient: token.token,
              locale: token.locale,
            }))
          : [
              {
                key: 'sms',
                recipient: event.user.phone ?? '',
                locale: tokens[0]?.locale,
              },
            ];
      if (!targets.length)
        targets.push({ key: 'none', recipient: '', locale: null });
      for (const target of targets) {
        await this.dispatchOne(event, type, channel, target, enabled);
      }
    }
    await this.prisma.notificationEvent.updateMany({
      where: { id: event.id, processed_at: null },
      data: { processed_at: new Date() },
    });
  }

  private async dispatchOne(
    event: {
      id: string;
      user_id: string;
      entity_type: string;
      entity_id: string;
    },
    type: NotificationType,
    channel: NotificationChannel,
    target: { key: string; recipient: string; locale?: string | null },
    enabled: boolean,
  ) {
    const locale = normalizedLocale(target.locale);
    const content = message(type, locale);
    const row = await this.prisma.notificationLog.upsert({
      where: { delivery_key: `${event.id}:${channel}:${target.key}` },
      update: {},
      create: {
        event_id: event.id,
        user_id: event.user_id,
        type,
        channel,
        delivery_key: `${event.id}:${channel}:${target.key}`,
        status: 'queued',
        locale,
        ...content,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
      },
    });
    if (row.status === 'sent' || row.status === 'skipped') return;
    if (!enabled || !target.recipient) {
      await this.prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: 'skipped' },
      });
      return;
    }
    try {
      await (channel === 'push' ? this.push : this.sms).send({
        recipient: target.recipient,
        ...content,
      });
      await this.prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: 'sent', sent_at: new Date(), error: null },
      });
    } catch (error) {
      this.logger.warn(`Notification ${row.id} failed: ${String(error)}`);
      await this.prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: 'failed', error: String(error).slice(0, 500) },
      });
    }
  }
}
