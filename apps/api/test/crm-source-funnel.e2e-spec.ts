// AURA OS — C5 / G15 source-to-margin funnel (§29), e2e (HTTP).
//
// The whole chain over the wire, four modules deep: a lead with a source converts to a deal, the
// deal is won, quoted, contracted, delivered as a project, and the project records real cost. Only
// then does the funnel report a margin — and it reports it against the source the lead came from.
//
// The other half of the test is what it REFUSES to say: a win with no contract, and a contract with
// no recorded cost, both read as unmeasured rather than as a 0% (or 100%) margin.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C5 source-to-margin funnel (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c5-tenant', companyId: null, actorId: null, correlationId: 'e2e-c5' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const funnel = async () => (await http.get('/api/v1/crm/source-funnel').expect(200)).body;
  const find = (f: { sources: Array<{ source: string }> }, s: string) => f.sources.find((x) => x.source === s);

  it('walks lead source → won deal → contract → project cost → actual margin', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Emaar FM' }).expect(201)).body;

    // The origin fact: this lead came from a referral.
    const lead = (await http.post('/api/v1/crm/leads')
      .send({ name: 'Referred Buyer', companyName: 'Emaar FM', source: 'referral' })
      .expect(201)).body;

    const opp = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'CCTV retrofit', accountId: account.id, value: 500_000, stage: 'proposal', leadId: lead.id })
      .expect(201)).body;

    // Won, but nothing downstream yet: the funnel must not invent a margin.
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
      .send({ stage: 'won', winReason: 'best technical score' })
      .expect(200);

    const wonOnly = find(await funnel(), 'referral');
    expect(wonOnly).toMatchObject({ won: 1, contracted: 0, measured: 0 });
    expect(wonOnly?.actualMargin).toBeNull();
    expect(wonOnly?.measurementNote).toBe('1 win(s) not yet contracted — margin unknown');

    // Quote it, approve it, accept it, convert it — the direct-sale path to a contract.
    const quote = (await http.post('/api/v1/crm/quotations')
      .send({
        quoteNumber: 'QT-C5-001', issueDate: '2026-07-16',
        customerName: 'Emaar FM', accountId: account.id, sourceOpportunityId: opp.id,
        lines: [{ description: 'Cameras + install', quantity: 1, unitPrice: 500_000 }],
      })
      .expect(201)).body;
    // R3 governance: approve locks the baseline, and only an approved quote can be sent.
    const status = async (action: string) =>
      await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action }).expect(200);
    await status('approve');
    await status('send');
    await status('accept');
    const contract = (await http.post(`/api/v1/crm/quotations/${quote.id}/convert-to-contract`).expect(201)).body;

    // Contracted, still not delivered — contract value appears, margin still does not.
    const contracted = find(await funnel(), 'referral');
    expect(contracted).toMatchObject({ contracted: 1, measured: 0 });
    expect(contracted?.contractValue).toBeGreaterThan(0);
    expect(contracted?.actualMargin).toBeNull();

    const project = (await http.post('/api/v1/projects/projects')
      .send({ title: 'Emaar CCTV delivery', contractId: contract.id, value: contract.value })
      .expect(201)).body;

    // A project with no CBS rows is still unmeasured — "no cost recorded" is not "cost of zero".
    const noCost = find(await funnel(), 'referral');
    expect(noCost?.measured).toBe(0);
    expect(noCost?.measurementNote).toBe('1 contract(s) with no recorded cost — margin unknown');

    // Now record real cost against the project's CBS.
    const node = (await http.post('/api/v1/projects/cbs')
      .send({ projectId: project.id, code: '01', title: 'Materials', category: 'direct', budgetAmount: 400_000 })
      .expect(201)).body;
    await http.patch(`/api/v1/projects/cbs/${node.id}`).send({ actualAmount: 380_000 }).expect(200);

    const measured = find(await funnel(), 'referral');
    expect(measured?.measured).toBe(1);
    expect(measured?.actualCost).toBe(380_000);
    expect(measured?.actualMargin).toBe(contract.value - 380_000);
    expect(measured?.measurementNote).toBe('margin covers all 1 win(s)');
    expect(measured?.winRate).toBe(100);
  });

  it('does not double-count a rolled-up CBS tree — parents carry their children\'s cost', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Tree Buyer', source: 'campaign' }).expect(201)).body;
    const opp = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'BMS upgrade', value: 200_000, stage: 'proposal', leadId: lead.id })
      .expect(201)).body;
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`).send({ stage: 'won', winReason: 'incumbent' }).expect(200);

    const quote = (await http.post('/api/v1/crm/quotations')
      .send({
        quoteNumber: 'QT-C5-002', issueDate: '2026-07-16', customerName: 'Tree Co',
        sourceOpportunityId: opp.id, lines: [{ description: 'BMS', quantity: 1, unitPrice: 200_000 }],
      })
      .expect(201)).body;
    for (const action of ['approve', 'send', 'accept']) {
      await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action }).expect(200);
    }
    const contract = (await http.post(`/api/v1/crm/quotations/${quote.id}/convert-to-contract`).expect(201)).body;
    const project = (await http.post('/api/v1/projects/projects')
      .send({ title: 'BMS delivery', contractId: contract.id, value: contract.value })
      .expect(201)).body;

    const parent = (await http.post('/api/v1/projects/cbs')
      .send({ projectId: project.id, code: '01', title: 'Works', category: 'direct', budgetAmount: 150_000 })
      .expect(201)).body;
    const child = (await http.post('/api/v1/projects/cbs')
      .send({ projectId: project.id, parentId: parent.id, code: '01.01', title: 'Panels', category: 'direct', budgetAmount: 150_000 })
      .expect(201)).body;
    // Recording on the child rolls the same 90k up into the parent — two rows, one real cost.
    await http.patch(`/api/v1/projects/cbs/${child.id}`).send({ actualAmount: 90_000 }).expect(200);

    const s = find(await funnel(), 'campaign');
    expect(s?.actualCost).toBe(90_000); // not 180_000
  });

  it('attributes to the lead\'s source, not the deal\'s restatement of it', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Origin Test', source: 'exhibition' }).expect(201)).body;
    await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Attribution deal', value: 50_000, stage: 'proposal', leadId: lead.id, source: 'cold_call' })
      .expect(201);

    const f = await funnel();
    expect(find(f, 'exhibition')?.opportunities).toBe(1);
    expect(find(f, 'cold_call')).toBeUndefined();
  });
});
