// AURA OS — quotation rate build-up + revision chain e2e (HTTP). Every cost
// factor rolls to direct → indirect → total cost; the quoted sell is fixed so
// profit/margin fall out. Each revision is its own record with its own sheet.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

interface Sheet {
  lines: Array<{
    description: string; quantity: number;
    supplyTotal: number; wastageTotal: number; materialTotal: number;
    technician: { manHours: number; total: number };
    engineer: { total: number }; projectManager: { total: number };
    labourTotal: number; directCost: number; indirectCost: number;
    costTotal: number; unitCostTotal: number; sellTotal: number; profit: number;
    marginPercent: number | null; markupPercent: number | null;
  }>;
  totalMaterial: number; totalLabour: number; totalDirect: number; totalIndirect: number;
  totalCost: number; totalSell: number; profit: number; marginPercent: number | null;
}

describe('quotation rate build-up e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'qp-tenant', companyId: null, actorId: null, correlationId: 'e2e-qp' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  /** One line: 10 × 589 sell = 5890. */
  const newQuote = async (quoteNumber: string) =>
    (
      await http.post('/api/v1/crm/quotations').send({
        quoteNumber, customerName: 'Marina Holdings', issueDate: '2026-07-01',
        lines: [{ description: 'CCTV supply & install', quantity: 10, unitPrice: 589, vatRate: 5 }],
      }).expect(201)
    ).body;

  /** R3 governance: draft → approved → sent (send is only legal from approved). */
  const sendQuote = async (id: string): Promise<void> => {
    await http.patch(`/api/v1/crm/quotations/${id}/status`).send({ action: 'approve' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${id}/status`).send({ action: 'send' }).expect(200);
  };

  it('an unpriced quotation is all-zero cost → 100% margin', async () => {
    const q = await newQuote('QT-B-1');
    const sheet = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(sheet.lines).toHaveLength(1);
    expect(sheet.totalCost).toBe(0);
    expect(sheet.totalSell).toBe(5890);
    expect(sheet.marginPercent).toBe(100);
  });

  it('every factor rolls up: material → labour → other directs → direct → indirect → cost → margin', async () => {
    const q = await newQuote('QT-B-2');
    const sheet = (
      await http.put(`/api/v1/crm/quotations/${q.id}/pricing`).send({
        lines: [{
          supplyUnitPrice: 300,     // 10 × 300            = 3000 supply
          wastagePercent: 2,        // 2% of 3000          =   60 wastage
          accessories: 200,         // lump                =  200
          technician: { count: 2, hours: 16, rate: 15 },   //  32 mh × 15 = 480
          engineer: { count: 1, hours: 8, rate: 20 },      //   8 h  × 20 = 160
          projectManager: { count: 1, hours: 4, rate: 40 },//   4 h  × 40 = 160
          transport: 300,
          equipmentRent: 150,
          subcontract: 250,
          otherDirect: 100,
          indirectPercent: 10,
        }],
      }).expect(200)
    ).body as Sheet;

    const l = sheet.lines[0];
    // Material: 3000 + 60 + 200 = 3260
    expect(l.supplyTotal).toBe(3000);
    expect(l.wastageTotal).toBe(60);
    expect(l.materialTotal).toBe(3260);
    // Labour: 480 + 160 + 160 = 800
    expect(l.technician.manHours).toBe(32);
    expect(l.technician.total).toBe(480);
    expect(l.engineer.total).toBe(160);
    expect(l.projectManager.total).toBe(160);
    expect(l.labourTotal).toBe(800);
    // Direct: 3260 + 800 + 300 + 150 + 250 + 100 = 4860
    expect(l.directCost).toBe(4860);
    // Indirect 10% = 486 → cost 5346; unit cost 534.6
    expect(l.indirectCost).toBe(486);
    expect(l.costTotal).toBe(5346);
    expect(l.unitCostTotal).toBe(534.6);
    // Sell 5890 → profit 544 → margin 9.24%, markup 10.18%
    expect(l.sellTotal).toBe(5890);
    expect(l.profit).toBe(544);
    expect(l.marginPercent).toBeCloseTo(9.24, 1);
    expect(l.markupPercent).toBeCloseTo(10.18, 1);
    // Sheet roll-up mirrors the line.
    expect(sheet.totalDirect).toBe(4860);
    expect(sheet.totalIndirect).toBe(486);
    expect(sheet.totalCost).toBe(5346);
    expect(sheet.profit).toBe(544);

    // Persisted — re-read matches.
    const reread = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(reread.totalCost).toBe(5346);
    expect(reread.lines[0].labourTotal).toBe(800);
  });

  it('accepts the legacy lean shape and lifts unitCosts into supply', async () => {
    const q = await newQuote('QT-B-3');
    const sheet = (
      await http.put(`/api/v1/crm/quotations/${q.id}/pricing`).send({ unitCosts: [450] }).expect(200)
    ).body as Sheet;
    expect(sheet.lines[0].supplyTotal).toBe(4500); // 10 × 450 lifted into supplyUnitPrice
    expect(sheet.totalCost).toBe(4500);
  });

  it('each revision keeps its own build-up — carried forward, then independent', async () => {
    const q = await newQuote('QT-B-4');
    await http.put(`/api/v1/crm/quotations/${q.id}/pricing`)
      .send({ lines: [{ supplyUnitPrice: 300, technician: { count: 1, hours: 10, rate: 20 } }] }).expect(200);
    await sendQuote(q.id);

    const rev1 = (await http.post(`/api/v1/crm/quotations/${q.id}/revise`).expect(201)).body;
    expect(rev1.revision).toBe(1);

    // Carried: 3000 supply + 200 labour = 3200
    const carried = (await http.get(`/api/v1/crm/quotations/${rev1.id}/pricing`).expect(200)).body as Sheet;
    expect(carried.totalCost).toBe(3200);

    // Re-price Rev 1 — Rev 0 must not move.
    await http.put(`/api/v1/crm/quotations/${rev1.id}/pricing`)
      .send({ lines: [{ supplyUnitPrice: 350, technician: { count: 1, hours: 10, rate: 20 } }] }).expect(200);
    const rev1Sheet = (await http.get(`/api/v1/crm/quotations/${rev1.id}/pricing`).expect(200)).body as Sheet;
    const rev0Sheet = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(rev1Sheet.totalCost).toBe(3700); // 3500 + 200
    expect(rev0Sheet.totalCost).toBe(3200); // untouched
  });

  it('the revision chain lists every revision of the quote number, oldest first', async () => {
    const q = await newQuote('QT-B-5');
    await sendQuote(q.id);
    await http.post(`/api/v1/crm/quotations/${q.id}/revise`).expect(201);

    const chain = (await http.get(`/api/v1/crm/quotations/${q.id}/revisions`).expect(200)).body as Array<{ revision: number; status: string }>;
    expect(chain).toHaveLength(2);
    expect(chain[0].revision).toBe(0);
    expect(chain[0].status).toBe('revised');
    expect(chain[1].revision).toBe(1);
  });
});
