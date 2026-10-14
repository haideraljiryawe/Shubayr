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
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
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
import {
  InvalidNotificationRecipientError,
  NotificationDeliveryError,
  PUSH_PROVIDER,
  SMS_PROVIDER,
} from './notification-provider';
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
    contentOverride?: ReturnType<typeof bilingualMessage>,
  ) {
    const eventKey = `${type}:${entityType}:${entityId}:${suffix}`;
    const content = contentOverride ?? bilingualMessage(type);
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
    type:
      'new_order' | 'order_cancelled' | 'order_rejected' | 'delivery_failed',
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

  async recordStaffWithPermission(
    tx: Prisma.TransactionClient,
    permission: string,
    type: NotificationType,
    entityType: string,
    entityId: string,
    suffix = '',
  ) {
    const staff = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN user_permission_grants ug ON ug.user_id = u.id
      LEFT JOIN permissions gp ON gp.id = ug.permission_id
      LEFT JOIN user_presets up ON up.user_id = u.id
      LEFT JOIN preset_permissions pp ON pp.preset_id = up.preset_id
      LEFT JOIN permissions ppn ON ppn.id = pp.permission_id
      WHERE u.is_active AND u.username IS NOT NULL
        AND (${permission} = gp.key OR ${permission} = ppn.key)
      ORDER BY u.id
    `);
    for (const user of staff) {
      await this.record(
        tx,
        user.id,
        type,
        entityType,
        entityId,
        suffix,
        'staff',
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
    if (entityType === 'price_publish_approval')
      return `/admin/finance/price-approvals/${entityId}`;
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
              attempts: 5,
              backoff: { type: 'push' },
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

  async register(
    userId: string,
    sessionId: string | null | undefined,
    sessionVersion: number,
    input: RegisterDeviceDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, is_active: true, session_version: sessionVersion },
        select: { id: true },
      });
      if (!user) throw new ForbiddenException('Session is no longer active');
      if (sessionId) {
        const activeSession = await tx.refreshToken.findFirst({
          where: {
            user_id: userId,
            session_id: sessionId,
            session_version: sessionVersion,
            revoked_at: null,
            expires_at: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!activeSession)
          throw new ForbiddenException('Session is no longer active');
      }
      const prior = await tx.deviceToken.findUnique({
        where: { token: input.token },
      });
      const now = new Date();
      if (sessionId) {
        await tx.deviceToken.updateMany({
          where: {
            user_id: userId,
            session_id: sessionId,
            token: { not: input.token },
            is_active: true,
          },
          data: { is_active: false, deactivated_at: now },
        });
      }
      const row = await tx.deviceToken.upsert({
        where: { token: input.token },
        create: {
          user_id: userId,
          session_id: sessionId ?? null,
          token: input.token,
          platform: input.platform,
          locale: input.locale ?? null,
          last_seen_at: now,
        },
        update: {
          user_id: userId,
          session_id: sessionId ?? null,
          platform: input.platform,
          locale: input.locale ?? null,
          is_active: true,
          deactivated_at: null,
          last_seen_at: now,
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
      return {
        id: row.id,
        user_id: row.user_id,
        token: row.token,
        platform: row.platform,
        locale: row.locale,
        is_active: row.is_active,
        last_seen_at: row.last_seen_at,
        deactivated_at: row.deactivated_at,
        created_at: row.created_at,
      };
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
    const where: Prisma.NotificationEventWhereInput = {
      user_id: userId,
      is_test: false,
      ...(query.unread ? { read_at: null } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.notificationEvent.count({
        where,
      }),
      this.prisma.notificationEvent.findMany({
        where,
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
        where: { user_id: userId, read_at: null, is_test: false },
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
        WHERE user_id = ${userId}::uuid AND read_at IS NULL AND NOT is_test
        ORDER BY id
        FOR UPDATE`;
      const readAt = new Date();
      if (unread.length) {
        await tx.notificationEvent.updateMany({
          where: { user_id: userId, read_at: null, is_test: false },
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
      where: { user_id: userId, read_at: null, is_test: false },
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

  async eligibleDevices(userId: string, requestedIds?: string[]) {
    const staleBefore = this.staleBefore();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        session_id: string;
        token: string;
        platform: string;
        locale: string | null;
        last_seen_at: Date;
      }>
    >(Prisma.sql`
      SELECT d.id, d.user_id, d.session_id, d.token, d.platform, d.locale,
             d.last_seen_at
      FROM device_tokens d
      JOIN users u ON u.id = d.user_id
      WHERE d.user_id = ${userId}::uuid
        AND d.is_active
        AND d.session_id IS NOT NULL
        AND d.last_seen_at >= ${staleBefore}
        AND u.is_active
        AND EXISTS (
          SELECT 1 FROM refresh_tokens r
          WHERE r.user_id = d.user_id
            AND r.session_id = d.session_id
            AND r.session_version = u.session_version
            AND r.revoked_at IS NULL
            AND r.expires_at > NOW()
        )
      ORDER BY d.last_seen_at DESC, d.id`);
    if (!requestedIds?.length) return rows;
    const requested = new Set(requestedIds);
    return rows.filter((row) => requested.has(row.id));
  }

  async recordTestPush(input: {
    userId: string;
    deviceIds: string[];
    title: string;
    body: string;
    operationId: string;
    operatorId: string;
  }) {
    const eventId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.notificationEvent.upsert({
        where: {
          event_key_user_id: {
            event_key: `push_test:${input.operationId}`,
            user_id: input.userId,
          },
        },
        update: {},
        create: {
          id: eventId,
          event_key: `push_test:${input.operationId}`,
          user_id: input.userId,
          type: 'push_test',
          target_role: 'customer',
          entity_type: 'push_test',
          entity_id: eventId,
          title_ar: input.title,
          body_ar: input.body,
          title_en: input.title,
          body_en: input.body,
          deep_link: '/notifications',
          is_test: true,
          target_device_ids: input.deviceIds,
        },
      });
      await this.audit.record(tx, {
        actorId: input.operatorId,
        action: 'push_test.enqueue',
        entityType: 'notification_event',
        entityId: event.id,
        after: {
          operation_id: input.operationId,
          target_user_id: input.userId,
          target_device_ids: input.deviceIds,
          test: true,
        },
      });
      return event;
    });
  }

  async testPushResults(eventId: string) {
    return this.prisma.notificationLog.findMany({
      where: { event_id: eventId, channel: 'push' },
      orderBy: { delivery_key: 'asc' },
      select: {
        delivery_key: true,
        status: true,
        error_code: true,
        provider_message_id: true,
        attempt_count: true,
      },
    });
  }

  async dispatch(eventId: string) {
    const event = await this.prisma.notificationEvent.findUnique({
      where: { id: eventId },
      include: { user: true },
    });
    if (!event || event.processed_at || !event.user.is_active) return;
    const type = event.type as NotificationType;
    if (!event.is_test && !notificationTypes.includes(type))
      throw new ConflictException('Unknown notification type');
    const requestedIds = event.is_test ? event.target_device_ids : undefined;
    const [tokens, legacy, overrides] = await Promise.all([
      this.eligibleDevices(event.user_id, requestedIds),
      event.is_test
        ? Promise.resolve(null)
        : this.prisma.notificationPreference.findUnique({
            where: { user_id: event.user_id },
          }),
      event.is_test
        ? Promise.resolve([])
        : this.prisma.notificationChannelPreference.findMany({
            where: { user_id: event.user_id, type },
          }),
    ]);
    let transient: NotificationDeliveryError | undefined;
    const channels = event.is_test ? (['push'] as const) : notificationChannels;
    for (const channel of channels) {
      const enabled =
        event.is_test ||
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
      if (!targets.length && !event.is_test)
        targets.push({ key: 'none', recipient: '', locale: null });
      for (const target of targets) {
        const error = await this.dispatchOne(
          event,
          type,
          channel,
          target,
          enabled,
        );
        if (error?.retryable) transient = error;
      }
    }
    if (transient) throw transient;
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
      is_test: boolean;
      title_ar: string;
      body_ar: string;
      title_en: string;
      body_en: string;
    },
    type: NotificationType,
    channel: NotificationChannel,
    target: { key: string; recipient: string; locale?: string | null },
    enabled: boolean,
  ): Promise<NotificationDeliveryError | undefined> {
    const locale = normalizedLocale(target.locale);
    const content = event.is_test
      ? locale === 'ar'
        ? { title: event.title_ar, body: event.body_ar }
        : { title: event.title_en, body: event.body_en }
      : message(type, locale);
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (channel === 'push' && target.recipient) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${target.recipient}, 0))`;
        const stillEligible = await this.eligibleDeviceInTransaction(
          tx,
          event.user_id,
          target.key,
          target.recipient,
        );
        if (!stillEligible) return undefined;
      }
      const row = await tx.notificationLog.upsert({
        where: { delivery_key: `${event.id}:${channel}:${target.key}` },
        update: {},
        create: {
          event_id: event.id,
          user_id: event.user_id,
          type: event.is_test ? 'push_test' : type,
          channel,
          delivery_key: `${event.id}:${channel}:${target.key}`,
          status: 'queued',
          locale,
          ...content,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
        },
      });
      if (row.status === 'sent' || row.status === 'skipped') return undefined;
      if (!enabled || !target.recipient) {
        await tx.notificationLog.update({
          where: { id: row.id },
          data: { status: 'skipped', lease_until: null },
        });
        return undefined;
      }
      const now = new Date();
      const claimed = await tx.notificationLog.updateMany({
        where: {
          id: row.id,
          OR: [
            { status: { in: ['queued', 'failed'] } },
            { status: 'sending', lease_until: { lt: now } },
          ],
        },
        data: {
          status: 'sending',
          lease_until: new Date(now.getTime() + 120_000),
          attempt_count: { increment: 1 },
          error: null,
          error_code: null,
        },
      });
      if (!claimed.count) return undefined;
      try {
        const result = await (channel === 'push' ? this.push : this.sms).send({
          recipient: target.recipient,
          ...content,
        });
        await tx.notificationLog.update({
          where: { id: row.id },
          data: {
            status: 'sent',
            sent_at: new Date(),
            error: null,
            error_code: null,
            provider_message_id: result.messageId,
            lease_until: null,
          },
        });
        return undefined;
      } catch (caught) {
        const error =
          caught instanceof NotificationDeliveryError
            ? caught
            : new NotificationDeliveryError('PROVIDER_FAILURE', false);
        this.logger.warn(
          `Notification delivery failed id=${row.id} code=${error.code}`,
        );
        if (
          channel === 'push' &&
          error instanceof InvalidNotificationRecipientError
        ) {
          await tx.deviceToken.updateMany({
            where: {
              id: target.key,
              user_id: event.user_id,
              token: target.recipient,
              is_active: true,
            },
            data: { is_active: false, deactivated_at: new Date() },
          });
        }
        await tx.notificationLog.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            error: error.code,
            error_code: error.code,
            lease_until: null,
          },
        });
        return error;
      }
    });
    return outcome;
  }

  private async eligibleDeviceInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    deviceId: string,
    token: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d.id
      FROM device_tokens d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = ${deviceId}::uuid
        AND d.user_id = ${userId}::uuid
        AND d.token = ${token}
        AND d.is_active
        AND d.session_id IS NOT NULL
        AND d.last_seen_at >= ${this.staleBefore()}
        AND u.is_active
        AND EXISTS (
          SELECT 1 FROM refresh_tokens r
          WHERE r.user_id = d.user_id
            AND r.session_id = d.session_id
            AND r.session_version = u.session_version
            AND r.revoked_at IS NULL
            AND r.expires_at > NOW()
        )
      FOR UPDATE OF d`);
    return rows.length === 1;
  }

  private staleBefore() {
    const configured = Number(process.env.PUSH_DEVICE_MAX_AGE_DAYS ?? 45);
    const days =
      Number.isFinite(configured) && configured > 0 ? configured : 45;
    return new Date(Date.now() - days * 86_400_000);
  }
}
