import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { validationExceptionFactory } from './common/http/api-error';
import { DecimalResponseInterceptor } from './common/http/decimal-response.interceptor';
import { parseCorsOrigins } from './config/cors';
import { compileTrustedProxies } from './config/trusted-proxies';
import { runWithClientIp } from './modules/audit/audit-context';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const trustProxy = compileTrustedProxies(
    config.get<string>('TRUSTED_PROXIES'),
  );
  app.set('trust proxy', trustProxy);
  app.use((request: Request, _response: Response, next: NextFunction) =>
    runWithClientIp(request.ip, next),
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: parseCorsOrigins(config.get<string>('CORS_ORIGINS')),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new DecimalResponseInterceptor());
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('API_PORT'), '0.0.0.0');
}

void bootstrap();
