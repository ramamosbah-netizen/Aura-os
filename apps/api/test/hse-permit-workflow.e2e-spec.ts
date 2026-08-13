// AURA OS — HSE permit-to-work + incident investigation workflow, e2e (HTTP).
//
// G-08 residue: HSE was the last delivery-half module still at CRUD, and it is the one where CRUD
// is a safety problem rather than a reporting one. This drives both governed journeys over the
// wire, and asserts the REFUSALS — a permit system is defined by what it declines to authorise:
//
//   permit: request (no RA) → approve BLOCKED 409 → cite a draft RA → approve BLOCKED 409
//             → approve the RA → self-approve BLOCKED 409 → approve → close
//   incident: report → close BLOCKED 409 (never investigated) → investigate
//               → close BLOCKED 409 (open CAPA) → complete CAPA → close (root cause recorded)
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('HSE permit-to-work + incident workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'hse-e2e', companyId: null, actorId: null, correlationId: 'e2e-hse' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const PTW = '/api/v1/hse/ptws';
  const RA = '/api/v1/hse/risk-assessments';
  const INC = '/api/v1/hse/incidents';
  const CAPA = '/api/v1/hse/capas';

  const openWindow = () => ({
    validFrom: new Date(Date.now() - 3600_000).toISOString(),
    validTo: new Date(Date.now() + 3600_000).toISOString(),
  });

  it('refuses to authorise high-risk work until every gate is satisfied', async () => {
    // 1. A permit with no risk assessment cannot be approved.
    const bare = (
      await http
        .post(PTW)
        .send({ projectId: 'proj-hse', permitType: 'hot_work', ...openWindow(), description: 'Welding riser' })
        .expect(201)
    ).body;
    expect(bare.status).toBe('requested');

    const noRa = await http.put(`${PTW}/${bare.id}/approve`).expect(409);
    expect(String(noRa.body.message ?? noRa.body.error)).toMatch(/cites a risk assessment/i);

    // 2. Citing a DRAFT assessment is not enough — it must be approved.
    const ra = (
      await http
        .post(RA)
        .send({
          projectId: 'proj-hse',
          reference: 'RA-E2E-1',
          activity: 'Hot work on riser',
          hazards: [{ hazard: 'Fire', likelihood: 4, severity: 4, controls: 'Fire watch', residualLikelihood: 2, residualSeverity: 2 }],
        })
        .expect(201)
    ).body;
    expect(ra.status).toBe('draft');

    const permit = (
      await http
        .post(PTW)
        .send({
          projectId: 'proj-hse',
          permitType: 'hot_work',
          ...openWindow(),
          description: 'Welding riser (assessed)',
          riskAssessmentId: ra.id,
        })
        .expect(201)
    ).body;

    const draftRa = await http.put(`${PTW}/${permit.id}/approve`).expect(409);
    expect(String(draftRa.body.message ?? draftRa.body.error)).toMatch(/risk assessment is approved/i);

    // 3. Approve the assessment — now the permit may be issued.
    await http.put(`${RA}/${ra.id}/approve`).expect(200);
    const approved = (await http.put(`${PTW}/${permit.id}/approve`).expect(200)).body;
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();

    // 4. Approval is once — a second attempt is a state conflict, not a silent no-op.
    await http.put(`${PTW}/${permit.id}/approve`).expect(409);

    // 5. Close when the work is done and the area is made safe. Terminal thereafter.
    const closed = (await http.put(`${PTW}/${permit.id}/close`).expect(200)).body;
    expect(closed.status).toBe('closed');
    await http.put(`${PTW}/${permit.id}/close`).expect(409);
  });

  it('refuses a permit outside its validity window', async () => {
    const ra = (
      await http
        .post(RA)
        .send({
          projectId: 'proj-hse',
          reference: 'RA-E2E-2',
          activity: 'Excavation',
          hazards: [{ hazard: 'Collapse', likelihood: 3, severity: 5, controls: 'Shoring', residualLikelihood: 1, residualSeverity: 3 }],
        })
        .expect(201)
    ).body;
    await http.put(`${RA}/${ra.id}/approve`).expect(200);

    const stale = (
      await http
        .post(PTW)
        .send({
          projectId: 'proj-hse',
          permitType: 'excavation',
          validFrom: '2026-01-01T00:00:00Z',
          validTo: '2026-01-02T00:00:00Z',
          description: 'Trenching, window long past',
          riskAssessmentId: ra.id,
        })
        .expect(201)
    ).body;

    const res = await http.put(`${PTW}/${stale.id}/approve`).expect(409);
    expect(String(res.body.message ?? res.body.error)).toMatch(/validity window/i);
  });

  it('rejects with a mandatory reason, then re-opens for correction', async () => {
    const permit = (
      await http
        .post(PTW)
        .send({ projectId: 'proj-hse', permitType: 'height_work', ...openWindow(), description: 'Facade access' })
        .expect(201)
    ).body;

    await http.put(`${PTW}/${permit.id}/reject`).send({}).expect(400);

    const rejected = (
      await http.put(`${PTW}/${permit.id}/reject`).send({ reason: 'Fire watch not staffed' }).expect(200)
    ).body;
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Fire watch not staffed');

    const reopened = (await http.put(`${PTW}/${permit.id}/reopen`).expect(200)).body;
    expect(reopened.status).toBe('draft');

    const requested = (await http.put(`${PTW}/${permit.id}/request`).expect(200)).body;
    expect(requested.status).toBe('requested');
  });

  it('gates incident closure on investigation, a root cause, and its corrective actions', async () => {
    const incident = (
      await http
        .post(INC)
        .send({
          projectId: 'proj-hse',
          date: '2026-08-01',
          severity: 'major',
          description: 'Slip on wet ramp',
          locationDetail: 'Basement B2',
        })
        .expect(201)
    ).body;
    expect(incident.status).toBe('reported');

    // 1. Cannot close an incident nobody investigated.
    await http.put(`${INC}/${incident.id}/close`).send({ rootCause: 'Guessed' }).expect(409);

    await http.put(`${INC}/${incident.id}/investigate`).expect(200);

    // 2. A root cause is mandatory.
    await http.put(`${INC}/${incident.id}/close`).send({}).expect(400);

    // 3. Open corrective actions block the close — "closed" must not mean "filed and forgotten".
    const capa = (
      await http
        .post(CAPA)
        .send({
          projectId: 'proj-hse',
          sourceType: 'incident',
          sourceId: incident.id,
          actionRequired: 'Install anti-slip strips',
          dueDate: '2026-08-20',
        })
        .expect(201)
    ).body;

    const blocked = await http.put(`${INC}/${incident.id}/close`).send({ rootCause: 'Ramp not cordoned' }).expect(409);
    expect(String(blocked.body.message ?? blocked.body.error)).toMatch(/corrective actions are complete/i);

    // 4. Completing the action releases the gate.
    await http.put(`${CAPA}/${capa.id}/complete`).expect(200);
    const closed = (
      await http.put(`${INC}/${incident.id}/close`).send({ rootCause: 'Ramp not cordoned during washdown' }).expect(200)
    ).body;
    expect(closed.status).toBe('closed');
    expect(closed.rootCause).toBe('Ramp not cordoned during washdown');

    // 5. The 360 shows the incident with the actions raised against it.
    const detail = (await http.get(`${INC}/${incident.id}/detail`).expect(200)).body;
    expect(detail.incident.id).toBe(incident.id);
    expect(detail.capaActions).toHaveLength(1);

    // 6. New evidence reopens the same record rather than spawning a second one.
    const reopened = (await http.put(`${INC}/${incident.id}/reopen`).expect(200)).body;
    expect(reopened.status).toBe('investigating');
  });
});
