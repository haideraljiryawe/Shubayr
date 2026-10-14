import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { createHash } from 'node:crypto';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import {
  DevPushProvider,
  DevSmsProvider,
  DisabledNotificationProvider,
  FcmPushProvider,
  PUSH_PROVIDER,
  SMS_PROVIDER,
} from './notification-provider';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new URL(config.getOrThrow<string>('REDIS_URL'));
        const database = new URL(config.getOrThrow<string>('DATABASE_URL'))
          .pathname;
        return {
          prefix: `shubayr:notify:${createHash('sha256').update(database).digest('hex').slice(0, 16)}`,
          connection: {
            host: redis.hostname,
            port: Number(redis.port || 6379),
            username: redis.username
              ? decodeURIComponent(redis.username)
              : undefined,
            password: redis.password
              ? decodeURIComponent(redis.password)
              : undefined,
            db: redis.pathname.length > 1 ? Number(redis.pathname.slice(1)) : 0,
            ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationStreamService,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('NOTIFICATION_PROVIDER');
        if (provider === 'fcm') {
          const fcm = new FcmPushProvider(
            config.getOrThrow<string>('FCM_SERVICE_ACCOUNT_JSON_BASE64'),
            config.getOrThrow<string>('FCM_PROJECT_ID'),
          );
          new Logger('PushConfiguration').log(
            `FCM HTTP v1 configured for project ${config.getOrThrow<string>('FCM_PROJECT_ID')}; run npm run push:diagnose to authenticate credentials`,
          );
          return fcm;
        }
        return provider === 'disabled'
          ? new DisabledNotificationProvider()
          : new DevPushProvider();
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('NOTIFICATION_PROVIDER') === 'dev'
          ? new DevSmsProvider()
          : new DisabledNotificationProvider(),
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
