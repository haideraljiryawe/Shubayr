import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import {
  FcmPushProvider,
  NotificationDeliveryError,
  PUSH_PROVIDER,
} from '../modules/notifications/notification-provider';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const config = app.get(ConfigService);
    const name = config.get<string>('NOTIFICATION_PROVIDER', 'dev');
    const provider = app.get<unknown>(PUSH_PROVIDER);
    if (name !== 'fcm' || !(provider instanceof FcmPushProvider)) {
      process.stdout.write(
        `Push provider: ${name}; no FCM credential check run.\n`,
      );
      return;
    }
    const result = await provider.diagnose();
    process.stdout.write(
      `FCM credentials authenticated for configured project ${result.projectId}.\n`,
    );
  } catch (error) {
    const code =
      error instanceof NotificationDeliveryError
        ? error.code
        : 'FCM_CONFIGURATION_INVALID';
    process.stderr.write(`FCM diagnostic failed: ${code}.\n`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
