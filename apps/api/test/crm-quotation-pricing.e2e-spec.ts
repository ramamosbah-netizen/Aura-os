// AURA OS — quotation pricing sheet + revision chain e2e (HTTP). Each revision
// is its own record, so each carries its own internal cost sheet; revising
// carries the costs forward.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

interface Sheet {
  lines: Array<{ description: string; quantity: number; unitCost: number; unitPrice: number; costTotal: number; sellTotal: number; marginPercent: number | null }>;
  totalCost: number; totalSell: number; marginAmount: number; marginPercent: number | null;
}

describe('quotation pricing sheet e2e (HTTP)', () => {
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

  const newQuote = async (quoteNumber: string) =>
    (
      await http.post('/api/v1/crm/quotations').send({
        quoteNumber, customerName: 'Marina Holdings', issueDate: '2026-07-01',
        lines: [
          { description: 'CCTV supply', quantity: 10, unitPrice: 589, vatRate: 5 },
          { description: 'Cabling', quantity: 200, unitPrice: 12, vatRate: 5 },
        ],
      }).expect(201)
    ).body;

  it('an unpriced quotation reads as 100% margin (no costs yet)', async () => {
    const q = await newQuote('QT-P-1');
    const sheet = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(sheet.lines).toHaveLength(2);
    expect(sheet.totalCost).toBe(0);
    expect(sheet.totalSell).toBe(8290); // 10×589 + 200×12
    expect(sheet.marginPercent).toBe(100);
  });

  it('saving unit costs derives per-line and blended margin', async () => {
    const q = await newQuote('QT-P-2');
    const saved = (
      await http.put(`/api/v1/crm/quotations/${q.id}/pricing`).send({ unitCosts: [450, 8] }).expect(200)
    ).body as Sheet;

    // Line 1: cost 10×450=4500, sell 5890 → margin 1390 = 23.6%
    expect(saved.lines[0].costTotal).toBe(4500);
    expect(saved.lines[0].marginPercent).toBeCloseTo(23.6, 1);
    // Line 2: cost 200×8=1600, sell 2400 → margin 800 = 33.33%
    expect(saved.lines[1].costTotal).toBe(1600);
    expect(saved.lines[1].marginPercent).toBeCloseTo(33.33, 1);
    // Blended: cost 6100, sell 8290 → margin 2190 = 26.42%
    expect(saved.totalCost).toBe(6100);
    expect(saved.marginAmount).toBe(2190);
    expect(saved.marginPercent).toBeCloseTo(26.42, 1);

    // Persisted — re-read returns the same sheet.
    const reread = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(reread.totalCost).toBe(6100);
  });

  it('each revision has its own sheet, carried forward then independently editable', async () => {
    const q = await newQuote('QT-P-3');
    await http.put(`/api/v1/crm/quotations/${q.id}/pricing`).send({ unitCosts: [450, 8] }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${q.id}/status`).send({ action: 'send' }).expect(200);

    const rev1 = (await http.post(`/api/v1/crm/quotations/${q.id}/revise`).expect(201)).body;
    expect(rev1.revision).toBe(1);

    // Costs carried into Rev 1.
    const carried = (await http.get(`/api/v1/crm/quotations/${rev1.id}/pricing`).expect(200)).body as Sheet;
    expect(carried.totalCost).toBe(6100);

    // Re-pricing Rev 1 does NOT touch Rev 0's sheet.
    await http.put(`/api/v1/crm/quotations/${rev1.id}/pricing`).send({ unitCosts: [500, 9] }).expect(200);
    const rev1Sheet = (await http.get(`/api/v1/crm/quotations/${rev1.id}/pricing`).expect(200)).body as Sheet;
    const rev0Sheet = (await http.get(`/api/v1/crm/quotations/${q.id}/pricing`).expect(200)).body as Sheet;
    expect(rev1Sheet.totalCost).toBe(6800); // 10×500 + 200×9
    expect(rev0Sheet.totalCost).toBe(6100); // untouched
  });

  it('the revision chain lists every revision of the quote number, oldest first', async () => {
    const q = await newQuote('QT-P-4');
    await http.patch(`/api/v1/crm/quotations/${q.id}/status`).send({ action: 'send' }).expect(200);
    await http.post(`/api/v1/crm/quotations/${q.id}/revise`).expect(201);

    const chain = (await http.get(`/api/v1/crm/quotations/${q.id}/revisions`).expect(200)).body as Array<{ revision: number; status: string }>;
    expect(chain).toHaveLength(2);
    expect(chain[0].revision).toBe(0);
    expect(chain[0].status).toBe('revised'); // superseded
    expect(chain[1].revision).toBe(1);
  });
});
