// AURA OS — Supertest HTTP e2e over the deal-chain spine (TIER-2 #40).
// Boots the real AppModule (in-memory stores) and drives HTTP through the same
// global prefix + tenant middleware the production host uses.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('spine e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    // Bind a fixed dev tenant per request (mirrors main.ts, minus auth/idempotency).
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run(
        { tenantId: 'test-tenant', companyId: null, actorId: null, correlationId: 'e2e' },
        () => next(),
      ),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health → ok', async () => {
    const res = await http.get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/v1/crm/accounts creates and is then listable', async () => {
    const create = await http
      .post('/api/v1/crm/accounts')
      .send({ name: 'E2E Client Ltd', industry: 'Construction' })
      .expect(201);
    expect(create.body.id).toBeTruthy();
    expect(create.body.name).toBe('E2E Client Ltd');

    const list = await http.get('/api/v1/crm/accounts').expect(200);
    expect(list.body.some((a: { id: string }) => a.id === create.body.id)).toBe(true);
  });

  it('rejects a nameless account with 400', async () => {
    await http.post('/api/v1/crm/accounts').send({ name: '  ' }).expect(400);
  });
});
