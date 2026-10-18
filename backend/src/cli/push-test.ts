import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { maskedRecipientId } from '../modules/notifications/notification-provider';
import { assertPushCliPolicy, parsePushCliArgs } from './push-cli-policy';

async function main() {
  const options = parsePushCliArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const config = app.get(ConfigService);
    assertPushCliPolicy({
      options,
      nodeEnv: config.get<string>('NODE_ENV'),
      allowedAccounts: config.get<string>('PUSH_TEST_ACCOUNTS'),
      allowedOperators: config.get<string>('PUSH_TEST_OPERATORS'),
    });
    const prisma = app.get(PrismaService);
    const notifications = app.get(NotificationsService);
    const [customer, operator] = await Promise.all([
      prisma.user.findFirst({
        where: {
          phone: options.account,
          is_active: true,
          role: { is: { name: 'customer' } },
        },
        select: { id: true, phone: true },
      }),
      prisma.user.findFirst({
        where: {
          username: options.operator,
          is_active: true,
          password_hash: { not: null },
        },
        select: { id: true, username: true },
      }),
    ]);
    if (!customer) throw new Error('TEST_CUSTOMER_NOT_FOUND');
    if (!operator) throw new Error('AUTHORIZED_OPERATOR_NOT_FOUND');

    let devices = await notifications.eligibleDevices(customer.id);
    if (options.platform !== 'all') {
      devices = devices.filter(
        (device) => device.platform === options.platform,
      );
    }
    if (options.device) {
      devices = devices.filter((device) => device.id === options.device);
    }
    process.stdout.write(`Eligible devices for ${options.account}:\n`);
    for (const device of devices) {
      process.stdout.write(
        `  ${device.id} platform=${device.platform} last_seen=${device.last_seen_at.toISOString()} token=${maskedRecipientId(device.token)}\n`,
      );
    }
    if (!devices.length) throw new Error('NO_ELIGIBLE_DEVICES');
    if (options.list) return;
    if (!options.title || !options.body)
      throw new Error('TITLE_AND_BODY_REQUIRED');
    if (options.title.length > 120 || options.body.length > 500) {
      throw new Error('MESSAGE_TOO_LONG');
    }
    process.stdout.write(
      `Preview: ${devices.length} device(s), title=${JSON.stringify(options.title)}, body=${JSON.stringify(options.body)}\n`,
    );
    if (options.preview || !options.confirmed) {
      process.stdout.write(
        'Dry run only. Re-run with --confirm SEND to enqueue.\n',
      );
      return;
    }

    const operationId = options.operationId ?? randomUUID();
    const event = await notifications.recordTestPush({
      userId: customer.id,
      deviceIds: devices.map((device) => device.id),
      title: options.title,
      body: options.body,
      operationId,
      operatorId: operator.id,
    });
    await notifications.enqueuePending();
    const deadline = Date.now() + 30_000;
    let results = await notifications.testPushResults(event.id);
    while (
      Date.now() < deadline &&
      (results.length < devices.length ||
        results.some((result) => ['queued', 'sending'].includes(result.status)))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      results = await notifications.testPushResults(event.id);
    }
    const byDevice = new Map(
      results.map((result) => [result.delivery_key.split(':').at(-1), result]),
    );
    for (const device of devices) {
      const result = byDevice.get(device.id);
      if (result?.status === 'sent') {
        process.stdout.write(
          `${device.id} accepted message_id=${result.provider_message_id ?? 'unknown'} attempts=${result.attempt_count}\n`,
        );
      } else {
        process.stdout.write(
          `${device.id} ${result?.status ?? 'pending'} reason=${result?.error_code ?? 'NO_RESULT'} attempts=${result?.attempt_count ?? 0}\n`,
        );
      }
    }
    process.stdout.write(`operation_id=${operationId} event_id=${event.id}\n`);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PUSH_TEST_FAILED';
    process.stderr.write(`Push test refused/failed: ${code}\n`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
