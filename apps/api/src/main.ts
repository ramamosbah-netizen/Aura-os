import 'reflect-metadata';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
  // When AUTH_REQUIRED=true (and auth is on), anonymous requests are rejected (401) except
  // a small public allowlist — the lockdown.
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const enforce = process.env.AUTH_REQUIRED === 'true' && auth.enabled;
  if (process.env.AUTH_REQUIRED === 'true' && !auth.enabled) {
    new Logger('Bootstrap').error('AUTH_REQUIRED is set but AUTH_JWT_SECRET is missing — cannot enforce; running open.');
  }
  const PUBLIC_PATHS = ['/api/health', '/api/auth/login', '/api/auth/status'];
  app.use(async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const h = req.headers['authorization'];
    const ctx = await auth.contextFromHeader(Array.isArray(h) ? h[0] : h);
    if (enforce && !ctx) {
      const path = (req.url ?? '').split('?')[0];
      const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
      if (!isPublic) {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ statusCode: 401, error: 'Unauthorized', message: 'authentication required' }));
        return;
      }
    }
    tenant.run(ctx ?? { tenantId: 'dev-tenant', companyId: null, actorId: null }, () => next());
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`AURA OS API listening on http://localhost:${port}/api`);
}

void bootstrap();
