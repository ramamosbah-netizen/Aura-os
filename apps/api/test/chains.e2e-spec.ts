// AURA OS — Supertest HTTP e2e over the business chains (deal chain + P2P).
// Boots the real AppModule (in-memory stores) and proves the cross-module
// reactor wires the chains end-to-end over HTTP, not just in unit harnesses.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/** Poll until the fetcher returns a non-empty array (reactor handlers are async). */
async function eventually<T>(fetcher: () => Promise<T[]>, tries = 20): Promise<T[]> {
  for (let i = 0; i < tries; i++) {
    const rows = await fetcher();
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

describe('business-chain e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
      transformOptions: { exposeUnsetFields: false },
    }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run(
        { tenantId: 'chain-tenant', companyId: null, actorId: null, correlationId: 'e2e-chains' },
        () => next(),
      ),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('deal chain: opportunity won → tender → award → contract → sign → project (+WBS seed)', async () => {
    // 1. Client account + opportunity, then win it.
    const account = (
      await http.post('/api/v1/crm/accounts').send({ name: 'Acme Developments LLC' }).expect(201)
    ).body;
    const opp = (
      await http
        .post('/api/v1/crm/opportunities')
        .send({ title: 'Marina Tower ELV', value: 750_000, accountId: account.id, accountName: account.name })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`).send({ stage: 'won' }).expect(200);

    // 2. Reactor auto-drafts the tender, carrying title/value/account down.
    const tenders = await eventually(async () =>
      ((await http.get('/api/v1/tendering/tenders').expect(200)).body as any[]).filter(
        (t) => t.title === 'Tender: Marina Tower ELV',
      ),
    );
    expect(tenders).toHaveLength(1);
    const tender = tenders[0];
    expect(tender.value).toBe(750_000);
    expect(tender.accountName).toBe('Acme Developments LLC');

    // 3. Award the tender → auto contract.
    await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'won' }).expect(200);
    const contracts = await eventually(async () =>
      (await http.get(`/api/v1/contracts/contracts?tenderId=${tender.id}`).expect(200)).body as any[],
    );
    expect(contracts).toHaveLength(1);
    const contract = contracts[0];
    expect(contract.value).toBe(750_000);

    // 4. Sign the contract → auto project, seeded with a root WBS node.
    await http.patch(`/api/v1/contracts/contracts/${contract.id}/status`).send({ status: 'active' }).expect(200);
    const projects = await eventually(async () =>
      (await http.get(`/api/v1/projects/projects?contractId=${contract.id}`).expect(200)).body as any[],
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].accountName).toBe('Acme Developments LLC');

    const wbs = await eventually(async () =>
      (await http.get(`/api/v1/projects/wbs?projectId=${projects[0].id}`).expect(200)).body as any[],
    );
    expect(wbs.length).toBeGreaterThanOrEqual(1);
  });

  it('P2P chain: PO issued → GRN receipt → PO auto-transitions to received', async () => {
    // Small-value PO auto-approves (below the approval-matrix threshold) → issue it.
    const po = (
      await http
        .post('/api/v1/procurement/purchase-orders')
        .send({ title: 'Cat6 cable drums', supplierName: 'Gulf Cables', value: 900 })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'issued' }).expect(200);

    // Goods arrive: GRN against the PO → reactor flips the PO to received.
    await http
      .post('/api/v1/inventory/grns')
      .send({ title: 'GRN — Cat6 cable drums', poId: po.id, poTitle: po.title, supplierName: 'Gulf Cables', value: 900 })
      .expect(201);

    const received = await eventually(async () => {
      const current = (await http.get(`/api/v1/procurement/purchase-orders/${po.id}`).expect(200)).body;
      return current.status === 'received' ? [current] : [];
    });
    expect(received).toHaveLength(1);
  });

  it('validated DTOs reject bad create payloads with 400', async () => {
    await http.post('/api/v1/crm/opportunities').send({ title: 42 }).expect(400); // non-string title
    await http.post('/api/v1/procurement/purchase-orders').send({ value: 100 }).expect(400); // missing title
    await http.post('/api/v1/hse/incidents').send({ projectId: 'p1' }).expect(400); // missing required fields
  });
});
