// AURA OS — PricingSheet aggregate e2e (HTTP). Pricing is its OWN aggregate now
// (crm/pricing-sheets), not a JSON pocket inside a quotation: a DRAFT is built up
// through the estimation engine, FREEZE commits it immutable, GENERATE writes the
// quotation from the frozen truth, and re-pricing after freeze is a new VERSION.
// Supersedes the embedded `PUT /crm/quotations/:id/pricing` path removed in
// "refactor(crm): remove the duplicated pricing paths — one source of truth" (03e0b5d).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

interface Sheet {
  id: string; name: string; version: number; status: 'draft' | 'frozen';
  opportunityId: string | null; quotationId: string | null; parentSheetId: string | null;
  lines: unknown[];
  totals: { totalCost: number; totalSell: number; marginPercent: number };
}

// One fully built-up line — every factor shows up in the roll-up:
//   material 10×300 ×1.02 wastage = 3060 · labour 32h×15 = 480 · equipment 150 ·
//   consumables 200 · subcontract 250  ⇒ direct 4140 · +10% overhead 414 ⇒ cost 4554
//   sell = 4554 / (1 − 0.10) = 5060 · margin 10%.
const LINE_A = {
  description: 'CCTV supply & install', quantity: 10,
  materialUnitCost: 300, wastagePercent: 2,
  labour: { hoursPerUnit: 3.2, crewSize: 2, hourlyRate: 15 },
  equipmentUnitCost: 15, consumablesUnitCost: 20, subcontractUnitCost: 25,
  overheadPercent: 10, riskPercent: 0, warrantyPercent: 0, contingencyPercent: 0,
  targetMarginPercent: 10,
};
// A leaner re-price: material 3500 + labour 200 = direct 3700, no loadings, 20% margin ⇒ sell 4625.
const LINE_B = {
  description: 'CCTV supply & install', quantity: 10,
  materialUnitCost: 350, wastagePercent: 0,
  labour: { hoursPerUnit: 1, crewSize: 1, hourlyRate: 20 },
  equipmentUnitCost: 0, consumablesUnitCost: 0, subcontractUnitCost: 0,
  overheadPercent: 0, riskPercent: 0, warrantyPercent: 0, contingencyPercent: 0,
  targetMarginPercent: 20,
};

describe('PricingSheet aggregate e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    // Mirror main.ts: the taxonomy filter maps domain guards to 404/409/400, not 500.
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'ps-tenant', companyId: null, actorId: null, correlationId: 'e2e-ps' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newSheet = async (name: string, extra: Record<string, unknown> = {}): Promise<Sheet> =>
    (await http.post('/api/v1/crm/pricing-sheets').send({ name, lines: [LINE_A], ...extra }).expect(201)).body as Sheet;

  it('create builds the draft up through the estimation engine — every factor in the roll-up', async () => {
    const s = await newSheet('Tower B — option A');
    expect(s.status).toBe('draft');
    expect(s.version).toBe(1);
    expect(s.totals.totalCost).toBe(4554);
    expect(s.totals.totalSell).toBe(5060);
    expect(s.totals.marginPercent).toBe(10);

    // Persisted — a re-read matches.
    const re = (await http.get(`/api/v1/crm/pricing-sheets/${s.id}`).expect(200)).body as Sheet;
    expect(re.totals.totalCost).toBe(4554);
  });

  it('saveLines re-prices the draft', async () => {
    const s = await newSheet('Tower B — resave');
    const updated = (
      await http.put(`/api/v1/crm/pricing-sheets/${s.id}/lines`).send({ lines: [LINE_B] }).expect(200)
    ).body as Sheet;
    expect(updated.totals.totalCost).toBe(3700);
    expect(updated.totals.totalSell).toBe(4625);
    expect(updated.totals.marginPercent).toBe(20);
  });

  it('freeze locks the build-up — re-pricing is refused with 409, the read stays open', async () => {
    const s = await newSheet('Tower B — freeze');
    const frozen = (await http.post(`/api/v1/crm/pricing-sheets/${s.id}/freeze`).expect(201)).body as Sheet;
    expect(frozen.status).toBe('frozen');

    // A write against a frozen sheet is a state-transition conflict, not a crash.
    const refused = await http.put(`/api/v1/crm/pricing-sheets/${s.id}/lines`).send({ lines: [LINE_B] }).expect(409);
    expect(String(refused.body.message ?? refused.body.error)).toMatch(/draft|frozen|version/i);

    // ...and the committed figures are untouched.
    const read = (await http.get(`/api/v1/crm/pricing-sheets/${s.id}`).expect(200)).body as Sheet;
    expect(read.totals.totalCost).toBe(4554);
  });

  it('revise raises a fresh draft version, carried forward; the frozen sheet never moves', async () => {
    const s = await newSheet('Tower B — revise');
    await http.post(`/api/v1/crm/pricing-sheets/${s.id}/freeze`).expect(201);

    const v2 = (await http.post(`/api/v1/crm/pricing-sheets/${s.id}/revise`).expect(201)).body as Sheet;
    expect(v2.version).toBe(2);
    expect(v2.status).toBe('draft');
    expect(v2.parentSheetId).toBe(s.id);
    expect(v2.totals.totalCost).toBe(4554); // carried forward from the frozen parent

    // Re-price v2 — the frozen v1 must not move.
    await http.put(`/api/v1/crm/pricing-sheets/${v2.id}/lines`).send({ lines: [LINE_B] }).expect(200);
    const v2r = (await http.get(`/api/v1/crm/pricing-sheets/${v2.id}`).expect(200)).body as Sheet;
    const v1r = (await http.get(`/api/v1/crm/pricing-sheets/${s.id}`).expect(200)).body as Sheet;
    expect(v2r.totals.totalCost).toBe(3700);
    expect(v1r.totals.totalCost).toBe(4554);

    // Change analysis vs the frozen parent: the money moved, and by how much.
    const cmp = (await http.get(`/api/v1/crm/pricing-sheets/${v2.id}/compare`).expect(200)).body as { costDiff: number };
    expect(cmp.costDiff).toBe(-854); // 3700 − 4554
  });

  it('generate writes the quotation from the FROZEN sheet — a draft is refused', async () => {
    const q = (
      await http.post('/api/v1/crm/quotations').send({
        quoteNumber: 'QT-PS-1', customerName: 'Marina Holdings', issueDate: '2026-07-01',
        lines: [{ description: 'placeholder', quantity: 1, unitPrice: 1, vatRate: 5 }],
      }).expect(201)
    ).body;
    const s = await newSheet('Tower B — generate', { quotationId: q.id });

    // A quote is the face of a COMMITTED price — an unfrozen draft cannot generate one.
    await http.post(`/api/v1/crm/pricing-sheets/${s.id}/generate-quotation`).expect(409);

    await http.post(`/api/v1/crm/pricing-sheets/${s.id}/freeze`).expect(201);
    const gen = (await http.post(`/api/v1/crm/pricing-sheets/${s.id}/generate-quotation`).expect(201)).body as { quotationId: string };
    expect(gen.quotationId).toBe(q.id);

    // The quotation's lines are regenerated from the sheet's build-up (one engine, one writer):
    // its subtotal is now the sheet's sell (10 × 506 unit-sell = 5060), not the placeholder.
    const quote = (await http.get(`/api/v1/crm/quotations/${q.id}`).expect(200)).body as { subtotal: number };
    expect(quote.subtotal).toBe(5060);
  });
});
