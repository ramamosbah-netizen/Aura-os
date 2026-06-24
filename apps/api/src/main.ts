import 'reflect-metadata';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService, TenantContext } from '@aura/core';
import { AppModule } from './app.module';
import { AccessDeniedFilter } from './auth/access-denied.filter';

// Load apps/api/.env.local (gitignored) before the kernel reads DATABASE_URL.
// dist/main.js → ../.env.local resolves to apps/api/.env.local.
config({ path: join(__dirname, '..', '.env.local') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableShutdownHooks(); // so OutboxRelay.onModuleDestroy clears its timer
  app.useGlobalFilters(new AccessDeniedFilter());

  // Per-request identity: verify a bearer token and bind the request context (ALS).
  // No token / auth off -> the dev default (actorId null), preserving the staged pass-through.
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  app.use((req: IncomingMessage, _res: unknown, next: () => void): void => {
    const h = req.headers['authorization'];
    const ctx = auth.contextFromHeader(Array.isArray(h) ? h[0] : h) ?? {
      tenantId: 'dev-tenant',
      companyId: null,
      actorId: null,
    };
    tenant.run(ctx, () => next());
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`AURA OS API listening on http://localhost:${port}/api`);
}

void bootstrap();
