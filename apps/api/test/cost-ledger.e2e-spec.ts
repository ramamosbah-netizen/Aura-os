// AURA OS — the Project Transaction Engine (cost sub-ledger) over HTTP. Proves the architecture:
// no module touches the CBS directly — every cost is an append-only ledger entry, and the CBS
// balance is SUM(ledger). A PO commit is +value; cancelling it is a −value REVERSAL (never a
// mutation to 0), and the drill-down keeps both. Idempotent: a redelivered cancel cannot double-reverse.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/** Poll until the fetcher returns a non-empty array (reactor handlers are async). */
async function eventually<T>(fetcher: () => Promise<T[]>, tries = 25): Promise<T[]> {
  for (let i = 0; i < tries; i++) {
    const rows = await fetcher();
    if (rows.length > 0) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

describe('cost ledger — the Transaction Engine (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'ledger-tenant', companyId: null, actorId: null, correlationId: 'e2e-ledger' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const nodeById = async (projectId: string, nodeId: string) =>
    ((await http.get(`/api/v1/projects/cbs?projectId=${projectId}`).expect(200)).body as Array<{ id: string; committedAmount: number }>).find((n) => n.id === nodeId)!;
  const ledger = async (cbsNodeId: string) =>
    (await http.get(`/api/v1/projects/cost-ledger?cbsNodeId=${cbsNodeId}`).expect(200)).body as Array<{ type: string; amount: number; source: string }>;

  it('PO lifecycle: create → committed entry → cancel → −reversal → CBS balance nets to 0 (idempotent)', async () => {
    // 1. A project with a single CBS cost line.
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'ELV Tower B', value: 500_000 }).expect(201)).body;
    const node = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: '1.1', title: 'Camera System' }).expect(201)).body;

    // 2. A PO CODED to that cost line → the engine posts a COMMITTED ledger entry (no module touches CBS).
    const po = (
      await http.post('/api/v1/procurement/purchase-orders')
        .send({ title: 'CCTV cameras', supplierName: 'Hikvision', value: 50_000, projectId: project.id, cbsNodeId: node.id })
        .expect(201)
    ).body;

    const afterCommit = await eventually(async () => await ledger(node.id));
    expect(afterCommit).toHaveLength(1);
    expect(afterCommit[0]).toMatchObject({ type: 'committed', amount: 50_000, source: 'po' });
    // CBS committed balance = SUM(ledger) = 50,000 (cached from the ledger).
    const committed = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.committedAmount === 50_000 ? [n] : []; });
    expect(committed[0].committedAmount).toBe(50_000);

    // 3. Cancel the PO → a NEGATIVE committed entry reverses it. The ledger is append-only.
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'cancelled' }).expect(200);
    const afterCancel = await eventually(async () => { const rows = await ledger(node.id); return rows.length >= 2 ? rows : []; });
    expect(afterCancel).toHaveLength(2);
    expect(afterCancel.some((t) => t.type === 'committed' && t.amount === -50_000 && t.source === 'reversal')).toBe(true);
    // Balance is back to 0 — a DERIVED sum, never mutated to 0 by hand.
    const zeroed = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.committedAmount === 0 ? [n] : []; });
    expect(zeroed[0].committedAmount).toBe(0);

    // 4. Idempotent: a redelivered cancel must NOT post a second reversal (the ledger's integrity is the whole point).
    await http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'cancelled' }).expect(200);
    await new Promise((r) => setTimeout(r, 250)); // let the (guarded) reactor run
    expect(await ledger(node.id)).toHaveLength(2);
  });
});
