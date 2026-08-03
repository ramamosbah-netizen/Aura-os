// AURA OS — the Project Transaction Engine (cost sub-ledger) over HTTP. Proves the architecture:
// no module touches the CBS directly — every cost is an append-only ledger entry, and the CBS
// balance is SUM(ledger). A PO commit is +value; cancelling it is a −value REVERSAL (never a
// mutation to 0), and the drill-down keeps both. Idempotent: a redelivered cancel cannot double-reverse.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const TENANT = 'ledger-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000aa'; // a granted actor (certify requires an authenticated approver)

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
    // Grant the acting user everything at tenant scope so authenticated gates (e.g. claim certify)
    // pass — the cost postings under test are driven by the reactors, not by who is signed in.
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-e2e-super', name: 'E2E Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-e2e-super', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-ledger' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const nodeById = async (projectId: string, nodeId: string) =>
    ((await http.get(`/api/v1/projects/cbs?projectId=${projectId}`).expect(200)).body as Array<{ id: string; budgetAmount: number; committedAmount: number; actualAmount: number }>).find((n) => n.id === nodeId)!;
  const ledger = async (cbsNodeId: string) =>
    (await http.get(`/api/v1/projects/cost-ledger?cbsNodeId=${cbsNodeId}`).expect(200)).body as Array<{ type: string; amount: number; quantity: number | null; source: string }>;

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

  it('Material: issue to a project → ACTUAL cost (+qty); return → NEGATIVE actual (−qty); CBS actual = net', async () => {
    // 1. A project + a CBS cost line for materials, and stock on hand valued at AED 500/unit.
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Villa 22', value: 200_000 }).expect(201)).body;
    const node = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: '2.1', title: 'Cable & Containment' }).expect(201)).body;
    const item = (
      await http.post('/api/v1/inventory/stock')
        .send({ code: 'CBL-2.5', name: '2.5mm² Cable', unit: 'm', openingQty: 100, openingCost: 500 })
        .expect(201)
    ).body;

    // 2. ISSUE 20 to the project's cost line → the engine posts an ACTUAL cost = 20 × 500 = 10,000 (+20 qty).
    await http.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'out', quantity: 20, projectId: project.id, cbsNodeId: node.id })
      .expect(201);

    const afterIssue = await eventually(async () => { const rows = await ledger(node.id); return rows.some((t) => t.source === 'material_issue') ? rows : []; });
    expect(afterIssue.find((t) => t.source === 'material_issue')).toMatchObject({ type: 'actual', amount: 10_000, quantity: 20 });
    const issued = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 10_000 ? [n] : []; });
    expect(issued[0].actualAmount).toBe(10_000);

    // 3. RETURN 5 from the project (valued at the same 500 rate) → a NEGATIVE actual −2,500 (−5 qty).
    await http.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'in', quantity: 5, unitCost: 500, projectId: project.id, cbsNodeId: node.id })
      .expect(201);

    const afterReturn = await eventually(async () => { const rows = await ledger(node.id); return rows.some((t) => t.source === 'material_return') ? rows : []; });
    expect(afterReturn.find((t) => t.source === 'material_return')).toMatchObject({ type: 'actual', amount: -2_500, quantity: -5 });
    // Material cost on the line = 10,000 − 2,500 = 7,500 (a DERIVED sum of the ledger, net qty 15).
    const netted = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 7_500 ? [n] : []; });
    expect(netted[0].actualAmount).toBe(7_500);
  });

  it('Subcontract: active → COMMITTED; each certified claim → ACTUAL (gross this period); mirrors the PO', async () => {
    // 1. A project + a CBS cost line, and a subcontract CODED to it (like a PO to a cost line).
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Mall Fit-out', value: 1_000_000 }).expect(201)).body;
    const node = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: '3.1', title: 'Fire Alarm' }).expect(201)).body;
    const sc = (
      await http.post('/api/v1/subcontracts')
        .send({ projectId: project.id, cbsNodeId: node.id, title: 'FA Installation', subcontractorName: 'SafeCo', value: 100_000, retentionPercentage: 10 })
        .expect(201)
    ).body;

    // 2. Award (activate) → COMMITTED 100,000 on the cost line (mirrors PO create → committed).
    await http.patch(`/api/v1/subcontracts/${sc.id}/status`).send({ status: 'active' }).expect(200);
    const committed = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.committedAmount === 100_000 ? [n] : []; });
    expect(committed[0].committedAmount).toBe(100_000);

    // 3. Certify claim #1 (40,000 gross work done) → ACTUAL 40,000. Retention is withheld payment, not a cost cut.
    const c1 = (await http.post('/api/v1/subcontracts/claims').send({ subcontractId: sc.id, workCompletedValue: 40_000 }).expect(201)).body;
    await http.patch(`/api/v1/subcontracts/claims/${c1.id}/certify`).send({}).expect(200);
    const act1 = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 40_000 ? [n] : []; });
    expect(act1[0].actualAmount).toBe(40_000);

    // 4. Certify claim #2 (cumulative 70,000) → ACTUAL += 30,000 (this-period gross). Total actual = 70,000.
    const c2 = (await http.post('/api/v1/subcontracts/claims').send({ subcontractId: sc.id, workCompletedValue: 70_000 }).expect(201)).body;
    await http.patch(`/api/v1/subcontracts/claims/${c2.id}/certify`).send({}).expect(200);
    const act2 = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 70_000 ? [n] : []; });
    expect(act2[0].actualAmount).toBe(70_000);
    // Committed is unchanged by claims — committed (100k) and actual (70k) are independent columns.
    expect((await nodeById(project.id, node.id)).committedAmount).toBe(100_000);

    // Drill-down: 1 committed (subcontract) + 2 actual (subcontract_claim).
    const rows = await ledger(node.id);
    expect(rows.filter((t) => t.source === 'subcontract')).toHaveLength(1);
    expect(rows.filter((t) => t.source === 'subcontract_claim')).toHaveLength(2);
  });

  it('Labour: daily allocation coded to a cost line → ACTUAL cost = man-hours × rate (qty = man-hours)', async () => {
    // 1. A project + a CBS cost line for labour.
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Tower Labour', value: 300_000 }).expect(201)).body;
    const node = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: '4.1', title: 'MEP Labour' }).expect(201)).body;

    // 2. Log 5 electricians × 8h = 40 man-hours @ AED 50/mh → ACTUAL 2,000 (qty 40).
    await http.post('/api/v1/site/labour')
      .send({ projectId: project.id, cbsNodeId: node.id, date: '2026-08-03', trade: 'Electrician', headcount: 5, hours: 8, costRate: 50 })
      .expect(201);
    const after1 = await eventually(async () => { const rows = await ledger(node.id); return rows.some((t) => t.source === 'labour_timesheet') ? rows : []; });
    expect(after1.find((t) => t.source === 'labour_timesheet')).toMatchObject({ type: 'actual', amount: 2_000, quantity: 40 });
    const l1 = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 2_000 ? [n] : []; });
    expect(l1[0].actualAmount).toBe(2_000);

    // 3. Log 2 more × 8h = 16 mh @ 50 → +800. Labour actual = 2,800 (SUM of the ledger).
    await http.post('/api/v1/site/labour')
      .send({ projectId: project.id, cbsNodeId: node.id, date: '2026-08-04', trade: 'Electrician', headcount: 2, hours: 8, costRate: 50 })
      .expect(201);
    const l2 = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.actualAmount === 2_800 ? [n] : []; });
    expect(l2[0].actualAmount).toBe(2_800);
    expect((await ledger(node.id)).filter((t) => t.source === 'labour_timesheet')).toHaveLength(2);
  });

  it('Variation: approved change order → BUDGET adjustment on the cost line (addition +, omission −)', async () => {
    // 1. A project + a CBS cost line with an opening budget of 100,000.
    const project = (await http.post('/api/v1/projects/projects').send({ title: 'Budget Villa', value: 500_000 }).expect(201)).body;
    const node = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: '5.1', title: 'Facade', budgetAmount: 100_000 }).expect(201)).body;
    expect((await nodeById(project.id, node.id)).budgetAmount).toBe(100_000);

    // 2. An APPROVED addition variation (+20,000) coded to the line → budget baseline 120,000.
    const add = (
      await http.post('/api/v1/projects/variations')
        .send({ projectId: project.id, cbsNodeId: node.id, title: 'Extra cladding', type: 'addition', amount: 20_000 })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/projects/variations/${add.id}/status`).send({ status: 'approved' }).expect(200);
    const afterAdd = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.budgetAmount === 120_000 ? [n] : []; });
    expect(afterAdd[0].budgetAmount).toBe(120_000);
    expect((await ledger(node.id)).find((t) => t.source === 'variation')).toMatchObject({ type: 'budget', amount: 20_000 });

    // 3. An APPROVED omission (−5,000) → budget nets to 115,000 (a −budget ledger entry).
    const omit = (
      await http.post('/api/v1/projects/variations')
        .send({ projectId: project.id, cbsNodeId: node.id, title: 'Descope trims', type: 'omission', amount: 5_000 })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/projects/variations/${omit.id}/status`).send({ status: 'approved' }).expect(200);
    const afterOmit = await eventually(async () => { const n = await nodeById(project.id, node.id); return n.budgetAmount === 115_000 ? [n] : []; });
    expect(afterOmit[0].budgetAmount).toBe(115_000);
    expect((await ledger(node.id)).filter((t) => t.type === 'budget')).toHaveLength(2);
  });
});
