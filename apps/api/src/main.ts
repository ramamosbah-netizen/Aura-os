import 'reflect-metadata';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Load apps/api/.env.local (gitignored) before the kernel reads DATABASE_URL.
// dist/main.js → ../.env.local resolves to apps/api/.env.local.
config({ path: join(__dirname, '..', '.env.local') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableShutdownHooks(); // so OutboxRelay.onModuleDestroy clears its timer
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`AURA OS API listening on http://localhost:${port}/api`);
}

void bootstrap();
