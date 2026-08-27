import 'reflect-metadata';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from 'dotenv';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import crypto from 'node:crypto';
import helmet from 'helmet';
import { AuthService, BODY_LIMIT, EdgeRateLimitGuard, OtlpMetricsPusher, PG_POOL, TenantContext, TX_RUNNER, PostgresTxRunner, cspFor, evaluateAuthPosture, evaluateRlsPosture, evaluateTxPosture, metrics, resolveCors } from '@aura/core';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import { MigrationGateService } from './health/migration-gate.service';
import { AccessDeniedFilter } from './auth/access-denied.filter';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Load apps/api/.env.local (gitignored) before the kernel reads DATABASE_URL.
// dist/main.js → ../.env.local resolves to apps/api/.env.local.
config({ path: join(__dirname, '..', '.env.local') });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // All routes are versioned under /api/v1 (Constitution Law #6 — consistent version prefix).
  app.setGlobalPrefix('api/v1');

  // ── HTTP edge security (G-07) ────────────────────────────────────────────────────────────
  // Everything below runs before a handler exists, which is the point: the permission guard and
  // the login throttle protect what a caller may *do*, and cannot answer volume, a hostile origin,
  // or an oversized body. Decisions live in core/src/http/edge-security.ts so they are testable
  // and greppable rather than buried here — this gate was reported "partial" for weeks while
  // being wholly absent.
  const isProd = process.env.NODE_ENV === 'production';

  // Trust the proxy so req.ip is the real client, not the load balancer. Without this every
  // request shares one bucket and the rate limiter is worse than useless — it throttles everyone
  // at once the moment the deployment sits behind anything.
  if (process.env.TRUST_PROXY !== 'false') app.set('trust proxy', 1);

  app.use(
    helmet({
      // Set per-request below: a JSON route gets `default-src 'none'`, Swagger UI needs more.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use((req: IncomingMessage & { originalUrl?: string }, res: ServerResponse, next: () => void) => {
    res.setHeader('Content-Security-Policy', cspFor(req.originalUrl ?? req.url));
    next();
  });
  app.useBodyParser('json', { limit: BODY_LIMIT, verify: (req: IncomingMessage & { rawBody?: Buffer }, _res: ServerResponse, buf: Buffer) => {
    if ((req.url ?? '').split('?')[0].endsWith('/whatsapp/webhook')) req.rawBody = Buffer.from(buf);
  } });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });

  const cors = resolveCors({ allowedOrigins: process.env.CORS_ALLOWED_ORIGINS, isProduction: isProd });
  if (cors.warning) new Logger('Bootstrap').warn(`⚠️  ${cors.warning}`);
  app.enableCors({ origin: cors.origin, credentials: cors.credentials });

  const rateLimit = app.get(EdgeRateLimitGuard);
  app.useGlobalGuards(rateLimit);
  const rl = rateLimit.describe();
  new Logger('Bootstrap').log(
    `✓ Edge security: helmet + CSP · rate limit ${rl.limit}/${rl.windowMs / 1000}s per IP · body ≤ ${BODY_LIMIT} · CORS ${
      cors.origin === true ? 'any origin (dev)' : `${(cors.origin as string[]).length} allowed origin(s)`
    }`,
  );

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

  // Transaction posture (Slice 8): governed financial workflows (freeze→supersede pricing, materialise
  // a quotation revision + its pricing link) commit as ONE transaction — real only behind a
  // PostgresTxRunner. Fail closed if a database is configured but DI resolved the NullTxRunner
  // fallback, rather than run those money flows non-atomically. Pure decision (tx-posture.ts),
  // symmetric with the auth and RLS posture gates. No DATABASE_URL (tests / in-memory) → allowed.
  const txPosture = evaluateTxPosture({
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    runnerIsTransactional: app.get(TX_RUNNER) instanceof PostgresTxRunner,
  });
  if (!txPosture.ok) throw new Error(`config: ${txPosture.reason}`);
  // Fail-closed (P0-1): production MUST run with a verifier configured. Refuse to boot "open"
  // rather than silently serving every tenant's data unauthenticated. A loud, explicit
  // ALLOW_INSECURE_NO_AUTH=true override remains for deployments fronted by an external gateway.
  // The decision itself is a pure, tested function (core/src/identity/auth-posture.ts), symmetric
  // with the RLS posture gate below — both answer "is enforcement actually on, and may we serve
  // anyway?", and both should be greppable rather than buried in this bootstrap.
  const authPosture = evaluateAuthPosture({
    verifierConfigured: auth.enabled,
    isProduction: isProd,
    allowInsecure: process.env.ALLOW_INSECURE_NO_AUTH === 'true',
  });
  if (authPosture.level === 'fatal') {
    new Logger('Bootstrap').error(authPosture.message);
    process.exit(1);
  } else if (authPosture.level === 'warn') {
    new Logger('Bootstrap').warn(`⚠️  ${authPosture.message}`);
  }

  // Fail-closed (P0-2): row-level security is the DB-level tenant isolation net. It is INERT when the
  // runtime connects as a superuser / BYPASSRLS role (the policies simply never apply), leaving
  // isolation resting on app-level `WHERE tenant_id` alone. Verify the actual connection role's
  // posture and refuse to boot that way in production — the least-privilege `aura_app` role
  // (migration 0163, NOSUPERUSER/NOBYPASSRLS) is what makes FORCE RLS take effect. See
  // docs/runbooks/rls-tenant-isolation.md. A loud ALLOW_RLS_BYPASS=true override remains for
  // deployments that intentionally isolate at another layer.
  const rlsPool = app.get<Pool | null>(PG_POOL, { strict: false });
  if (rlsPool) {
    try {
      const res = await rlsPool.query<{ role: string; bypasses: boolean }>(
        'SELECT current_user AS role, (rolsuper OR rolbypassrls) AS bypasses FROM pg_roles WHERE rolname = current_user',
      );
      const posture = res.rows[0];
      if (posture) {
        const decision = evaluateRlsPosture({
          role: posture.role,
          bypasses: posture.bypasses,
          isProduction: isProd,
          allowBypass: process.env.ALLOW_RLS_BYPASS === 'true',
        });
        if (decision.level === 'fatal') {
          new Logger('Bootstrap').error(`FATAL: ${decision.message}`);
          process.exit(1);
        } else if (decision.level === 'warn') {
          new Logger('Bootstrap').warn(`⚠️  ${decision.message}`);
        } else {
          new Logger('Bootstrap').log(`✓ RLS posture: ${decision.message}`);
        }
      }
    } catch (err) {
      new Logger('Bootstrap').warn(`Could not verify DB RLS posture: ${(err as Error).message}`);
    }
  }
  // Reject anonymous requests when AUTH_REQUIRED=true, and by default in production once a verifier
  // is present. Uses auth.enabled so a JWKS-only (Supabase/IdP) config counts, not just the HS256 secret.
  const enforce = process.env.AUTH_REQUIRED === 'true' || (isProd && auth.enabled);
  if (enforce && !auth.enabled) {
    new Logger('Bootstrap').error('AUTH_REQUIRED is set but no verifier is configured (AUTH_JWKS_URL / AUTH_JWT_SECRET) — cannot enforce; running open.');
  }
  // `/auth/login` covers `/auth/login/mfa` and `/auth/login/password-change` (prefix match).
  // `/auth/refresh` is UNAUTHENTICATED by design (S2): it presents an opaque refresh token in the
  // body, not an access token, so — like login — it must be reachable without an Authorization
  // header, or the AUTH_REQUIRED gate rejects it with 401 before rotation ever runs.
  const PUBLIC_PATHS = ['/api/v1/health', '/api/v1/auth/login', '/api/v1/auth/status', '/api/v1/auth/refresh', '/api/v1/whatsapp/webhook'];
  // Spine create endpoints where an Idempotency-Key may be *required* (not just honored).
  const requireIdem = process.env.IDEMPOTENCY_REQUIRED === 'true';
  const SPINE_CREATES = [
    '/api/v1/crm/accounts', '/api/v1/tendering/tenders', '/api/v1/contracts/contracts',
    '/api/v1/projects/projects', '/api/v1/procurement/purchase-orders', '/api/v1/inventory/grns',
    '/api/v1/finance/invoices', '/api/v1/finance/payments',
  ];
  // HTTP request metrics (gap #6): counter + duration sum/count by method and status class,
  // low-cardinality by design (no per-path labels). Rendered at /metrics, pushed via OTLP.
  metrics.counter('http_requests_total', 'HTTP requests, by method and status class.');
  metrics.counter('http_request_duration_ms_sum', 'Total HTTP handler time in ms, by status class.');
  metrics.counter('http_request_duration_ms_count', 'HTTP requests measured, by status class.');
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const started = Date.now();
    res.on('finish', () => {
      const cls = `${Math.floor(res.statusCode / 100)}xx`;
      metrics.inc('http_requests_total', { method: req.method ?? 'GET', status: cls });
      metrics.inc('http_request_duration_ms_sum', { status: cls }, Date.now() - started);
      metrics.inc('http_request_duration_ms_count', { status: cls });
    });
    next();
  });

  // Migration deploy-gate (R2 / G-P0-2): if the DB schema is behind this build's migrations,
  // refuse business routes with a loud 503 rather than 500-ing deep in a handler against a
  // missing column. Health/metrics/docs stay reachable so the degraded state is observable.
  const migrationGate = app.get(MigrationGateService);
  const GATE_ALLOW = ['/api/v1/health', '/api/v1/metrics', '/api/docs'];
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (!migrationGate.isDegraded()) return next();
    const path = (req.url ?? '').split('?')[0];
    if (GATE_ALLOW.some((p) => path === p || path.startsWith(`${p}/`))) return next();
    const s = migrationGate.getStatus();
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.setHeader('retry-after', '30');
    res.end(
      JSON.stringify({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'SCHEMA_MIGRATION_PENDING',
        message: `database schema is behind the application; ${s.pending.length} migration(s) pending`,
        pending: s.pending,
      }),
    );
  });

  // OTLP metrics push (gap #6) — no-op unless OTLP_METRICS_URL is configured. Refreshes the
  // outbox depth gauges right before each export (same queries the /metrics scrape runs).
  const pool = app.get<Pool | null>(PG_POOL, { strict: false });
  const otlp = new OtlpMetricsPusher(metrics, async () => {
    if (!pool) return;
    const count = async (where: string): Promise<number | null> => {
      try {
        const r = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM public.aura_events WHERE ${where}`);
        return Number(r.rows[0]?.c ?? 0);
      } catch {
        return null;
      }
    };
    const pending = await count('processed_at IS NULL');
    if (pending !== null) metrics.set('outbox_pending', pending);
    const dead = await count('processed_at IS NOT NULL AND processing_error IS NOT NULL');
    if (dead !== null) metrics.set('outbox_dead_letter', dead);
  });
  otlp.start();

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
