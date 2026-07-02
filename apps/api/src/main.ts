import 'reflect-metadata';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from 'dotenv';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import { AuthService, TenantContext } from '@aura/core';
import { AppModule } from './app.module';
import { AccessDeniedFilter } from './auth/access-denied.filter';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Load apps/api/.env.local (gitignored) before the kernel reads DATABASE_URL.
// dist/main.js → ../.env.local resolves to apps/api/.env.local.
config({ path: join(__dirname, '..', '.env.local') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // All routes are versioned under /api/v1 (Constitution Law #6 — consistent version prefix).
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.enableShutdownHooks(); // so OutboxRelay.onModuleDestroy clears its timer
  app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
  // Global input validation. Safe for existing interface DTOs (no class metadata → skipped);
  // activates per-field validation + type coercion as DTOs are migrated to decorated classes.
  // exposeUnsetFields:false — absent body fields must stay ABSENT on the transformed DTO;
  // otherwise class fields materialise as undefined own-properties and `{...existing, ...dto}`
  // in PATCH handlers wipes stored values.
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidUnknownValues: false,
    transformOptions: { exposeUnsetFields: false },
  }));

  // OpenAPI/Swagger — spec at /api/docs-json, UI at /api/docs.
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('AURA OS API').setVersion('1').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, doc);

  // Per-request identity: verify a bearer token and bind the request context (ALS).
  // No token / auth off -> the dev default (actorId null), preserving the staged pass-through.
  // When AUTH_REQUIRED=true (and auth is on), anonymous requests are rejected (401) except
  // a small public allowlist — the lockdown.
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const enforce = process.env.AUTH_REQUIRED === 'true';
  if (enforce && !process.env.AUTH_JWT_SECRET) {
    new Logger('Bootstrap').error('AUTH_REQUIRED is set but AUTH_JWT_SECRET is missing — cannot enforce; running open.');
  }
  const PUBLIC_PATHS = ['/api/v1/health', '/api/v1/auth/login', '/api/v1/auth/status'];
  // Spine create endpoints where an Idempotency-Key may be *required* (not just honored).
  const requireIdem = process.env.IDEMPOTENCY_REQUIRED === 'true';
  const SPINE_CREATES = [
    '/api/v1/crm/accounts', '/api/v1/tendering/tenders', '/api/v1/contracts/contracts',
    '/api/v1/projects/projects', '/api/v1/procurement/purchase-orders', '/api/v1/inventory/grns',
    '/api/v1/finance/invoices', '/api/v1/finance/payments',
  ];
  app.use(async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    // Idempotency-Key enforcement on spine creates (gated; default off — non-breaking).
    if (requireIdem && req.method === 'POST') {
      const path = (req.url ?? '').split('?')[0];
      if (SPINE_CREATES.includes(path) && !req.headers['idempotency-key']) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ statusCode: 400, error: 'Bad Request', code: 'IDEMPOTENCY_REQUIRED', message: 'Idempotency-Key header is required for this create' }));
        return;
      }
    }
    const h = req.headers['authorization'];
    const ctx = await auth.contextFromHeader(Array.isArray(h) ? h[0] : h);

    // Tracing: correlation ID propagation
    const rawCorrId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const correlationId = Array.isArray(rawCorrId)
      ? rawCorrId[0]
      : rawCorrId || crypto.randomUUID();

    res.setHeader('x-correlation-id', correlationId);

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

    const tenantInfo = ctx
      ? { ...ctx, correlationId }
      : { tenantId: 'dev-tenant', companyId: null, actorId: null, correlationId };

    tenant.run(tenantInfo, () => next());
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`AURA OS API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
