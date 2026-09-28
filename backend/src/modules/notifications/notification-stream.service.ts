import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';

type Ticket = Pick<
  AuthenticatedRequestUser,
  'id' | 'surface' | 'role' | 'sessionVersion'
>;

@Injectable()
export class NotificationStreamService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly redis: Redis;
  private readonly prefix: string;
  private timer?: ReturnType<typeof setInterval>;
  private publishing = false;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const redisUrl = config.getOrThrow<string>('REDIS_URL');
    const database = new URL(config.getOrThrow<string>('DATABASE_URL'))
      .pathname;
    this.prefix = `shubayr:notify:${createHash('sha256').update(database).digest('hex').slice(0, 16)}`;
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.publishPending(), 500);
    this.timer.unref();
    void this.publishPending();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.redis.quit();
  }

  async issue(user: AuthenticatedRequestUser) {
    const ticket = randomBytes(32).toString('base64url');
    const payload: Ticket = {
      id: user.id,
      surface: user.surface,
      role: user.role,
      sessionVersion: user.sessionVersion,
    };
    await this.redis.set(
      `${this.prefix}:ticket:${ticket}`,
      JSON.stringify(payload),
      'EX',
      60,
      'NX',
    );
    return { ticket, expires_at: new Date(Date.now() + 60_000) };
  }

  private async consume(ticket: string): Promise<Ticket> {
    const raw = await this.redis.call(
      'GETDEL',
      `${this.prefix}:ticket:${ticket}`,
    );
    if (typeof raw !== 'string')
      throw new UnauthorizedException('Invalid or expired stream ticket');
    const value = JSON.parse(raw) as Ticket;
    const user = await this.prisma.user.findFirst({
      where: { id: value.id, is_active: true },
      include: { role: true, work_profile: true },
    });
    if (!user || user.session_version !== value.sessionVersion)
      throw new UnauthorizedException('Stream session is no longer valid');
    if (value.surface === 'app') {
      const role = user.role?.name;
      if (
        role !== value.role ||
        (user.work_profile &&
          (!user.work_profile.is_active || user.work_profile.app_role !== role))
      ) {
        throw new UnauthorizedException('Stream role is no longer valid');
      }
    }
    return value;
  }

  async open(ticket: string, since: string | undefined, response: Response) {
    const identity = await this.consume(ticket);
    let cursor = this.parseSequence(since);
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const subscriber = this.redis.duplicate();
    const channel = `${this.prefix}:stream:${identity.id}`;
    const buffered: string[] = [];
    let replaying = true;
    const sendRaw = (raw: string) => {
      const row = JSON.parse(raw) as {
        sequence: string;
        event: string;
        data: unknown;
      };
      const sequence = BigInt(row.sequence);
      if (sequence <= cursor) return;
      cursor = sequence;
      response.write(
        `id: ${row.sequence}\nevent: ${row.event}\ndata: ${JSON.stringify(row.data)}\n\n`,
      );
    };
    subscriber.on('message', (_received, raw) =>
      replaying ? buffered.push(raw) : sendRaw(raw),
    );
    await subscriber.subscribe(channel);
    while (true) {
      const backlog = await this.prisma.notificationStreamEvent.findMany({
        where: { user_id: identity.id, sequence: { gt: cursor } },
        orderBy: { sequence: 'asc' },
        take: 1000,
      });
      for (const row of backlog) sendRaw(this.serialize(row));
      if (backlog.length < 1000) break;
    }
    replaying = false;
    for (const raw of buffered) sendRaw(raw);
    const heartbeat = setInterval(
      () => response.write(': heartbeat\n\n'),
      15_000,
    );
    heartbeat.unref();
    response.on('close', () => {
      clearInterval(heartbeat);
      void subscriber.unsubscribe(channel).finally(() => subscriber.quit());
    });
  }

  private parseSequence(value?: string) {
    if (!value) return 0n;
    try {
      const parsed = BigInt(value);
      return parsed >= 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }

  private serialize(row: { sequence: bigint; event: string; data: unknown }) {
    return JSON.stringify({
      sequence: row.sequence.toString(),
      event: row.event,
      data: row.data,
    });
  }

  private async publishPending() {
    if (this.publishing) return;
    this.publishing = true;
    try {
      const rows = await this.prisma.notificationStreamEvent.findMany({
        where: { published_at: null },
        orderBy: { sequence: 'asc' },
        take: 200,
      });
      for (const row of rows) {
        await this.redis.publish(
          `${this.prefix}:stream:${row.user_id}`,
          this.serialize(row),
        );
        await this.prisma.notificationStreamEvent.updateMany({
          where: { sequence: row.sequence, published_at: null },
          data: { published_at: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(`Notification stream publish failed: ${String(error)}`);
    } finally {
      this.publishing = false;
    }
  }
}
