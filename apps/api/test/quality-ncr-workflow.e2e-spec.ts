// AURA OS — QA/QC NCR corrective-action workflow, e2e (HTTP).
//
// The full operational journey over the wire, proving the state machines are enforced and every
// stage leaves an audit record:
//   IR request → start-inspection → REJECT (fail) → raise NCR (carries IR provenance)
//     → plan → correct → verify(REJECT → re-open) → correct → verify(ACCEPT → closed, immutable).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('QA/QC NCR workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'qa-e2e', companyId: null, actorId: null, correlationId: 'e2e-ncr' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const B = '/api/v1/quality';

  it('enforces IR + NCR lifecycles and records every transition', async () => {
    // 1. Request an inspection, start it, then FAIL it.
    const ir = (
      await http.post(`${B}/irs`).send({ projectId: 'proj-1', irNumber: 'IR-001', discipline: 'electrical', locationDetail: 'L02 corridor', inspectionDate: '2026-08-20' }).expect(201)
    ).body;
    expect(ir.status).toBe('requested');
    await http.post(`${B}/irs/${ir.id}/start-inspection`).send({}).expect(201);
    await http.put(`${B}/irs/${ir.id}/resolve`).send({ status: 'rejected', comments: 'Containment not bonded' }).expect(200);

    // Illegal: a resolved IR cannot be re-resolved (state machine → 409).
    await http.put(`${B}/irs/${ir.id}/resolve`).send({ status: 'approved' }).expect(409);

    // 2. Raise an NCR from the failed inspection — provenance is carried onto the NCR.
    const ncr = (
      await http.post(`${B}/irs/${ir.id}/raise-ncr`).send({ ncrNumber: 'NCR-001', description: 'Cable containment not bonded to earth', severity: 'major' }).expect(201)
    ).body;
    expect(ncr.status).toBe('raised');
    expect(ncr.sourceIrId).toBe(ir.id);
    expect(ncr.sourceIrNumber).toBe('IR-001');

    // Illegal: cannot correct a freshly-raised NCR (must plan first) → 409.
    await http.post(`${B}/ncrs/${ncr.id}/correct`).send({}).expect(409);

    // 3. Plan corrective action (root cause + action required).
    await http.post(`${B}/ncrs/${ncr.id}/plan`).send({ rootCause: 'Missing earth bond kit' }).expect(400); // no corrective action
    await http.post(`${B}/ncrs/${ncr.id}/plan`).send({ rootCause: 'Missing earth bond kit', correctiveAction: 'Install bonding + re-test', assignedTo: 'site-eng' }).expect(201);
    expect((await http.get(`${B}/ncrs/${ncr.id}`).expect(200)).body.status).toBe('action_planned');

    // 4. Mark corrected, then QA REJECTS the verification (must carry a note) → re-opened.
    await http.post(`${B}/ncrs/${ncr.id}/correct`).send({}).expect(201);
    await http.post(`${B}/ncrs/${ncr.id}/verify`).send({ accepted: false }).expect(400); // rejection needs a note
    await http.post(`${B}/ncrs/${ncr.id}/verify`).send({ accepted: false, note: 'Bond present but continuity still failing' }).expect(201);
    expect((await http.get(`${B}/ncrs/${ncr.id}`).expect(200)).body.status).toBe('action_planned');

    // 5. Re-correct, then QA ACCEPTS → closed.
    await http.post(`${B}/ncrs/${ncr.id}/correct`).send({}).expect(201);
    await http.post(`${B}/ncrs/${ncr.id}/verify`).send({ accepted: true, note: 'Continuity verified < 0.1Ω' }).expect(201);
    const closed = (await http.get(`${B}/ncrs/${ncr.id}`).expect(200)).body;
    expect(closed.status).toBe('closed');

    // Two verification records (one reject, one accept) form the audit trail.
    const verifications = (await http.get(`${B}/ncrs/${ncr.id}/verifications`).expect(200)).body;
    expect(verifications).toHaveLength(2);
    expect(verifications.map((v: { outcome: string }) => v.outcome).sort()).toEqual(['accepted', 'rejected']);

    // 6. Closed is immutable — a further correct is refused by the state machine.
    await http.post(`${B}/ncrs/${ncr.id}/correct`).send({}).expect(409);
  });
});
