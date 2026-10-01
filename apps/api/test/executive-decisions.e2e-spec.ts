import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * F-10 — THE EXECUTIVE DECISION SET, Auth ON, the shipped catalogue, in-memory stores (contract proof;
 * persistence and the screen are proved in apps/web/e2e/executive-decisions.spec.ts).
 *
 *   coverage    all fourteen governed decisions (MGT-01…MGT-14) are answered, each MEASURED from a
 *               named source or UNAVAILABLE with its reason — never silently absent
 *   lineage     every decision states when it was read (one pass, one time), what it counted, and
 *               what it left out; the drilldown's records ARE the counted population
 *   truth       seeded facts appear where they belong, exactly once, at their values
 *   isolation   another tenant's facts are not counted
 *   authority   Senior Management reads it; a Sales user is refused
 */
it('F-10: every executive decision states its time, population and source, and opens the exact records', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-executive-decisions-secret';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const access = app.get(AccessService);
  const users = app.get(UsersService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    const A = `exec-a-${Date.now()}`;
    const B = `exec-b-${Date.now()}`;
    const seat = (userId: string, roleId: string, t: string) => {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: t } });
      users.save({ tenantId: t, userId, displayName: userId, active: true });
    };
    seat('exec-ceo', 'r-executive', A);
    seat('exec-admin', 'r-admin', A);
    seat('exec-sales', 'r-sales', A);
    seat('exec-admin-b', 'r-admin', B);
    const as = (userId: string, t: string) => request.agent(app.getHttpServer()).set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: t })}`);
    const ceo = as('exec-ceo', A);
    const admin = as('exec-admin', A);
    const adminB = as('exec-admin-b', B);

    // ── Facts in tenant A ────────────────────────────────────────────────────────────────────────
    const opp = (await admin.post('/api/v1/crm/opportunities').send({ title: 'Tower CCTV', value: 250_000 }).expect(201)).body as { id: string };
    const project = (await admin.post('/api/v1/projects/projects').send({ title: 'Marina tower', value: 900_000 }).expect(201)).body as { id: string };
    const risk = (await admin.post('/api/v1/projects/risks').send({ projectId: project.id, title: 'Late SIRA approval', likelihood: 'high', impact: 'high' }).expect(201)).body as { id: string; severity: string };
    const invoice = (await admin.post('/api/v1/finance/customer-invoices').send({
      invoiceNumber: `EX-${Date.now()}`, customerName: 'Marina Developments', issueDate: '2026-08-01', dueDate: '2026-08-31',
      lines: [{ description: 'Progress claim', quantity: 1, unitPrice: 100_000, vatRate: 5 }],
    }).expect(201)).body as { id: string };
    await admin.post(`/api/v1/finance/customer-invoices/${invoice.id}/issue`).send({}).expect(201);
    const variation = (await admin.post('/api/v1/projects/variations').send({ projectId: project.id, title: 'Extra cameras', type: 'addition', amount: 40_000 }).expect(201)).body as { id: string };
    await admin.patch(`/api/v1/projects/variations/${variation.id}/status`).send({ status: 'submitted' }).expect(200);
    // …and in tenant B, which must not be counted.
    await adminB.post('/api/v1/crm/opportunities').send({ title: 'Other tenant deal', value: 9_999_999 }).expect(201);

    // ── The view ─────────────────────────────────────────────────────────────────────────────────
    const view = (await ceo.get('/api/v1/intelligence/executive-decisions').expect(200)).body as {
      asOf: string; currency: string;
      decisions: Array<{ id: string; capability: string; state: string; asOf: string; source: string; basis: string | null; unavailableReason: string | null;
        figures: Array<{ label: string; value: number; unit: string }>; population: { counted: number; of: string; excluded: Array<{ count: number; reason: string }> }; recordCount: number }>;
    };
    expect(view.currency).toBe('AED');
    expect(view.decisions.map((d) => d.capability)).toEqual(Array.from({ length: 14 }, (_, i) => `MGT-${String(i + 1).padStart(2, '0')}`));
    for (const d of view.decisions) {
      expect(d.asOf, `${d.id} is read in the same pass as the rest`).toBe(view.asOf);
      expect(d.source, `${d.id} names its source`).toBeTruthy();
      if (d.state === 'measured') {
        expect(d.figures.length, `${d.id} has a headline`).toBeGreaterThan(0);
        expect(d.population.of, `${d.id} says what it counted`).toBeTruthy();
        expect(d.recordCount, `${d.id}: the drilldown IS the counted population`).toBe(d.population.counted);
      } else {
        expect(d.unavailableReason, `${d.id} says why it cannot be measured`).toBeTruthy();
      }
    }
    // A reader that THROWS is reported as unavailable ("It could not be read…") — which is right for
    // an executive, and wrong for a proof: here every source exists, so none may have failed.
    expect(view.decisions.filter((d) => d.unavailableReason?.startsWith('It could not be read')).map((d) => `${d.id}: ${d.unavailableReason}`)).toEqual([]);
    const byId = Object.fromEntries(view.decisions.map((d) => [d.id, d]));
    const figure = (id: string, label: string) => byId[id].figures.find((f) => f.label === label)?.value;

    expect(figure('pipeline', 'Open pipeline'), 'tenant B\'s deal is not in tenant A\'s pipeline').toBe(250_000);
    expect(figure('pipeline', 'Open deals')).toBe(1);
    expect(figure('cash', 'Receivable')).toBe(105_000);
    expect(figure('cash', 'Overdue'), 'due 31 Aug and unpaid').toBe(105_000);
    expect(byId.cash.basis).toMatch(/AR-GL-01/);
    expect(figure('risks', 'High or critical risks open')).toBe(1);
    expect(figure('variations', 'Variations awaiting decision')).toBe(1);
    expect(figure('variations', 'Their net value')).toBe(40_000);

    // ── The drilldown: the exact records, each with the page that holds it ─────────────────────────
    const pipeline = (await ceo.get('/api/v1/intelligence/executive-decisions/pipeline').expect(200)).body as { currency: string; records: Array<{ id: string; href: string; value: number; unit: string }> };
    expect(pipeline.currency, 'the drilldown names the currency its money is in, as the view does').toBe(view.currency);
    expect(pipeline.records).toEqual([expect.objectContaining({ id: opp.id, href: `/crm/opportunities/${opp.id}`, value: 250_000, unit: 'currency' })]);
    const cash = (await ceo.get('/api/v1/intelligence/executive-decisions/cash').expect(200)).body as { records: Array<{ id: string; href: string; status: string }> };
    expect(cash.records).toEqual([expect.objectContaining({ id: invoice.id, href: `/finance/customer-invoices/${invoice.id}`, status: 'overdue' })]);
    const risks = (await ceo.get('/api/v1/intelligence/executive-decisions/risks').expect(200)).body as { records: Array<{ id: string; href: string; value: number | null; unit: string | null }> };
    expect(risks.records.map((r) => r.id)).toEqual([risk.id]);
    expect(risks.records[0].href).toBe(`/project/${project.id}`);
    expect(risks.records[0], 'a risk is counted, not measured — no value is made up for it').toMatchObject({ value: null, unit: null });
    // The variations list holds money and days side by side; each row says which it is.
    const variations = (await ceo.get('/api/v1/intelligence/executive-decisions/variations').expect(200)).body as { records: Array<{ id: string; value: number; unit: string }> };
    expect(variations.records).toEqual([expect.objectContaining({ id: variation.id, value: 40_000, unit: 'currency' })]);

    // ── Authority ────────────────────────────────────────────────────────────────────────────────
    await as('exec-sales', A).get('/api/v1/intelligence/executive-decisions').expect(403);
    await as('exec-sales', A).get('/api/v1/intelligence/executive-decisions/pipeline').expect(403);
    await ceo.get('/api/v1/intelligence/executive-decisions/not-a-decision').expect(404);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
  }
});
