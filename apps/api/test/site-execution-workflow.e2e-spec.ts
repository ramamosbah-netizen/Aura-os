// AURA OS — G-34 Site Execution workflow, e2e (HTTP).
//
// The complete governed site-diary journey over the wire:
//   create report → add labour + plant + progress(BOQ) + delay + evidence → submit → review
//     → REJECT (reason, reopens to draft) → correct → resubmit → review → APPROVE
//   → verify the immutable line-items + approval audit, and that illegal transitions / late edits
//     are refused (409).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G-34 Site Execution workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'site-e2e', companyId: null, actorId: null, correlationId: 'e2e-g34' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const B = '/api/v1/site';
  const detail = (id: string) => http.get(`${B}/daily-reports/${id}`).expect(200).then((r) => r.body);

  it('drives the full daily-report journey and enforces the state machine', async () => {
    // 1. Create the report (draft).
    const report = (
      await http.post(`${B}/daily-reports`).send({ projectId: 'proj-1', date: '2026-08-12', workDescription: 'Second fix ELV — L2 west', siteConditions: 'Clear, 34°C' }).expect(201)
    ).body;
    expect(report.status).toBe('draft');
    const id = report.id;

    // Illegal: cannot approve a draft (409).
    await http.post(`${B}/daily-reports/${id}/approve`).send({}).expect(409);

    // 2. Add the diary line-items (WHO/WHAT/HOW MUCH).
    await http.post(`${B}/daily-reports/${id}/labour`).send({ trade: 'ELV Technician', headcount: 4, hours: 8, contractor: 'Acme ELV' }).expect(201);
    await http.post(`${B}/daily-reports/${id}/plant`).send({ equipmentType: 'Scissor Lift', equipmentId: 'SL-01', operatingHours: 6, status: 'operational' }).expect(201);
    await http.post(`${B}/daily-reports/${id}/progress`).send({ description: 'CCTV cameras', boqItemId: 'BOQ-CCTV', plannedQty: 30, installedQty: 24, unit: 'no' }).expect(201);
    await http.post(`${B}/daily-reports/${id}/delays`).send({ category: 'material', description: 'Cat6 cable not delivered', durationHours: 4, responsibleParty: 'Supplier', mitigation: 'Expedited' }).expect(201);
    await http.post(`${B}/daily-reports/${id}/evidence`).send({ fileId: 'file-abc', category: 'progress', description: 'L2 CCTV progress', hash: 'sha256:deadbeef' }).expect(201);

    let d = await detail(id);
    expect(d.labour).toHaveLength(1);
    expect(d.labour[0].manHours).toBe(32);
    expect(d.progress[0].progressPct).toBe(80);
    expect(d.progress[0].boqItemId).toBe('BOQ-CCTV');
    expect(d.plant).toHaveLength(1);
    expect(d.delays[0].responsibleParty).toBe('Supplier');
    expect(d.evidence[0].fileId).toBe('file-abc');

    // 3. Submit → review → REJECT (reason mandatory; reopens to draft).
    await http.put(`${B}/daily-reports/${id}/submit`).send({}).expect(200);
    // Illegal: cannot add a line-item once submitted (frozen snapshot → 409).
    await http.post(`${B}/daily-reports/${id}/labour`).send({ trade: 'Helper', headcount: 2, hours: 8 }).expect(409);
    await http.post(`${B}/daily-reports/${id}/start-review`).send({}).expect(201);
    await http.post(`${B}/daily-reports/${id}/reject`).send({}).expect(400); // reason required
    const rejected = (await http.post(`${B}/daily-reports/${id}/reject`).send({ reason: 'Add the helper headcount' }).expect(201)).body;
    expect(rejected.status).toBe('draft'); // rejection reopens for correction
    expect(rejected.rejectionReason).toMatch(/helper/i);

    // 4. Correct (now editable again) → resubmit → review → APPROVE.
    await http.post(`${B}/daily-reports/${id}/labour`).send({ trade: 'Helper', headcount: 2, hours: 8 }).expect(201);
    await http.put(`${B}/daily-reports/${id}/submit`).send({}).expect(200);
    await http.post(`${B}/daily-reports/${id}/start-review`).send({}).expect(201);
    await http.post(`${B}/daily-reports/${id}/approve`).send({}).expect(201);

    d = await detail(id);
    expect(d.report.status).toBe('approved');
    expect(d.report.approvedAt).toBeTruthy();
    expect(d.labour).toHaveLength(2); // both labour lines preserved (immutable audit)

    // 5. Approved is immutable — no further edits or transitions.
    await http.post(`${B}/daily-reports/${id}/labour`).send({ trade: 'Mason', headcount: 1, hours: 8 }).expect(409);
    await http.put(`${B}/daily-reports/${id}/submit`).send({}).expect(409);
  });
});
