// AURA OS — T5 BOQ Excel import (§2.2 "BOQ Import"), e2e (HTTP).
//
// A REAL xlsx workbook goes over the wire (multipart), and the productionized import proves:
// the header is found below a title block, dirty numbers are cleaned, problem rows come back
// as per-row ISSUES (never silently skipped or invented), dryRun previews without writing,
// replace-mode clears the old bill AND cascades its estimates (the T3 no-orphans rule), and
// the tender value recomputes from the imported bill.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import * as xlsx from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/** Build a real .xlsx buffer from rows (array-of-arrays). */
const workbook = (rows: unknown[][]): Buffer => {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), 'BOQ');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

describe('T5 BOQ Excel import (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't5-tenant', companyId: null, actorId: null, correlationId: 'e2e-t5' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newTenderWithBoq = async () => {
    const tender = (await http.post('/api/v1/tendering/tenders').send({ title: 'Hospital ELV fit-out', value: 0 }).expect(201)).body;
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    return { tender, boq };
  };

  const upload = (tenderId: string, boqId: string, buf: Buffer, fields: Record<string, string> = {}) => {
    let req = http.post(`/api/v1/tendering/tenders/${tenderId}/boq/upload`).field('boqId', boqId);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', buf, 'boq.xlsx');
  };

  const realWorldSheet = workbook([
    ['HOSPITAL PROJECT — ELV PACKAGE'],           // title block above the header
    ['Bill of Quantities', '', '', 'Rev', 'C'],
    [],
    ['Item Code', 'Description', 'Unit', 'Qty', 'Rate (AED)'],
    ['1.1', 'CCTV cameras', 'no', 10, '1,200.00'], // dirty-but-valid number
    ['SECTION 2 — HEAD END', '', '', '', ''],      // section heading → issue, skipped
    ['2.1', 'NVR 64ch', 'no', 'TBD', 500],         // bad qty → issue, skipped
    ['2.2', 'Monitor 55"', 'no', 2, 'by others'],  // bad rate → imported at 0, issue
    ['2.3', 'UPS 6kVA', 'no', 2, 3200],
  ]);

  it('dryRun previews the parse — items, per-row issues, detected header — without writing', async () => {
    const { tender, boq } = await newTenderWithBoq();
    const res = await upload(tender.id, boq.id, realWorldSheet, { dryRun: 'true' }).expect(201);

    expect(res.body.dryRun).toBe(true);
    expect(res.body.headerRow).toBe(4); // found below the title block
    expect(res.body.items.map((i: { itemCode: string }) => i.itemCode)).toEqual(['1.1', '2.2', '2.3']);
    expect(res.body.items[0].rate).toBe(1200); // "1,200.00" cleaned, not parseFloat'd to 1
    expect(res.body.issues).toHaveLength(3);

    // Nothing was written.
    const { items } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    expect(items).toHaveLength(0);
  });

  it('imports the sheet, reports the issues, and the tender value follows the bill', async () => {
    const { tender, boq } = await newTenderWithBoq();
    const res = await upload(tender.id, boq.id, realWorldSheet).expect(201);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.replaced).toBe(0);
    expect(res.body.issues.map((i: { row: number }) => i.row)).toEqual([6, 7, 8]);

    // 10×1200 + 2×0 + 2×3200 = 18,400
    const after = (await http.get(`/api/v1/tendering/tenders/${tender.id}`).expect(200)).body;
    expect(after.value).toBe(18_400);
  });

  it('replace-mode clears the old bill and cascades its estimates (no orphans)', async () => {
    const { tender, boq } = await newTenderWithBoq();

    // An existing item WITH a rate build-up.
    const old = (await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/items`)
      .send({ boqId: boq.id, itemCode: 'OLD-1', description: 'Old scope', unit: 'no', quantity: 5, rate: 100 })
      .expect(201)).body;
    await http.post('/api/v1/tendering/estimates')
      .send({ boqItemId: old.id, components: [{ costType: 'material', description: 'x', quantity: 1, unitCost: 80 }], applyToBoq: false })
      .expect(201);

    const res = await upload(tender.id, boq.id, realWorldSheet, { mode: 'replace' }).expect(201);
    expect(res.body.replaced).toBe(1);

    const { items } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    expect(items.map((i: { itemCode: string }) => i.itemCode).sort()).toEqual(['1.1', '2.2', '2.3']);
    // The old item's build-up went with it.
    await http.get(`/api/v1/tendering/estimates/boq-item/${old.id}`).expect(404);
  });

  it('a sheet with no recognizable header is a 400 that says what is missing', async () => {
    const { tender, boq } = await newTenderWithBoq();
    const res = await upload(tender.id, boq.id, workbook([['just'], ['prose'], ['here']]));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('could not detect a BOQ header');
  });

  it('the JSON import route refuses empty arrays and unknown modes', async () => {
    const { tender, boq } = await newTenderWithBoq();
    expect((await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/import`).send({ boqId: boq.id, items: [] })).status).toBe(400);
    expect((await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/import`)
      .send({ boqId: boq.id, mode: 'merge', items: [{ itemCode: '1', description: 'x', unit: 'no', quantity: 1, rate: 1 }] })).status).toBe(400);
  });
});
