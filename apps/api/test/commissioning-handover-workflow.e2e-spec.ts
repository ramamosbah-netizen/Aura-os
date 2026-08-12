// AURA OS — Commissioning → Handover workflow, e2e (HTTP).
//
// The full close-out journey over the wire:
//   register system → add test points → record results (one FAILS) → raise a punch item
//     → commission BLOCKED (open defect, 409) → close the punch → pass the remaining point
//     → COMMISSION (witnessed) → (reactor opens/finds handover) → build handover checklist
//     → submit → REJECT → fix → submit → ACCEPT (warranty clock starts).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('Commissioning → Handover workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'cx-e2e', companyId: null, actorId: null, correlationId: 'e2e-cx' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const CX = '/api/v1/commissioning/records';
  const H = '/api/v1/commissioning/handovers';

  it('drives commissioning with a test sheet + punch gate, then project handover', async () => {
    // 1. Register a CCTV commissioning record.
    const rec = (await http.post(CX).send({ projectId: 'proj-cx', code: 'CX-CCTV-01', title: 'CCTV T&C', system: 'cctv' }).expect(201)).body;
    const id = rec.id;

    // 2. Add two test points and record results — one passes, one FAILS.
    const t1 = (await http.post(`${CX}/${id}/test-items`).send({ pointNo: '1', description: 'Cam 1 live view', expected: 'Image on VMS' }).expect(201)).body;
    const t2 = (await http.post(`${CX}/${id}/test-items`).send({ pointNo: '2', description: 'Cam 2 live view', expected: 'Image on VMS' }).expect(201)).body;
    await http.put(`${CX}/${id}/test-items/${t1.id}/result`).send({ result: 'pass', actual: 'OK' }).expect(200);
    // a fail without remarks is refused (400)
    await http.put(`${CX}/${id}/test-items/${t2.id}/result`).send({ result: 'fail' }).expect(400);
    await http.put(`${CX}/${id}/test-items/${t2.id}/result`).send({ result: 'fail', remarks: 'No image — cable fault' }).expect(200);

    // The tally + status reflect the itemized results (1/2 passed, a fail present).
    const d = (await http.get(`${CX}/${id}/detail`).expect(200)).body;
    expect(d.record.pointsTotal).toBe(2);
    expect(d.record.pointsPassed).toBe(1);
    expect(d.record.status).toBe('failed');

    // 3. Raise a punch item for the defect.
    const punch = (await http.post(`${CX}/${id}/punch`).send({ description: 'Cam 2 cable fault', severity: 'major' }).expect(201)).body;

    // Fix the defect: re-test point 2 to pass.
    await http.put(`${CX}/${id}/test-items/${t2.id}/result`).send({ result: 'pass', actual: 'Image OK after re-term' }).expect(200);

    // 4. Commission is BLOCKED while the punch item is open (409).
    await http.put(`${CX}/${id}/commission`).send({ commissionedBy: 'eng1', witnessedBy: 'consultant1' }).expect(409);

    // 5. Close the punch, then commission succeeds (all points passed, no open defects).
    await http.put(`${CX}/${id}/punch/${punch.id}/close`).send({ resolution: 'Re-terminated cable; image verified' }).expect(200);
    const commissioned = (await http.put(`${CX}/${id}/commission`).send({ commissionedBy: 'eng1', witnessedBy: 'consultant1' }).expect(200)).body;
    expect(commissioned.status).toBe('commissioned');
    expect(commissioned.witnessedBy).toBe('consultant1');

    // Immutable: cannot add test items to a commissioned record (409).
    await http.post(`${CX}/${id}/test-items`).send({ pointNo: '3', description: 'x' }).expect(409);

    // 6. Handover: build the deliverables checklist, submit, reject, fix, submit, accept.
    const pkg = (await http.post(H).send({ projectId: 'proj-cx', code: 'HO-01', title: 'Project Handover' }).expect(201)).body;
    // cannot submit without the core deliverables (409)
    await http.put(`${H}/${pkg.id}/submit`).send({}).expect(409);
    await http.put(`${H}/${pkg.id}/checklist`).send({ omManuals: true, asBuilts: true, testCertificates: true }).expect(200);
    await http.put(`${H}/${pkg.id}/submit`).send({}).expect(200);
    await http.put(`${H}/${pkg.id}/reject`).send({ reason: 'Warranty certificates missing' }).expect(200);
    await http.put(`${H}/${pkg.id}/checklist`).send({ warrantyDocs: true }).expect(200);
    await http.put(`${H}/${pkg.id}/submit`).send({}).expect(200);
    const accepted = (await http.put(`${H}/${pkg.id}/accept`).send({ clientRepresentative: 'Client PM', warrantyMonths: 24 }).expect(200)).body;
    expect((accepted.package ?? accepted).status).toBe('accepted');

    // Immutable: an accepted package cannot be re-submitted (409).
    await http.put(`${H}/${pkg.id}/submit`).send({}).expect(409);
  });
});
