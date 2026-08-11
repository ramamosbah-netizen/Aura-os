// AURA OS — G-32 engineering shop-drawing workflow, e2e (HTTP).
//
// The full operational journey over the wire, proving the state machine is enforced (not a settable
// status field) and that every stage leaves an audit record:
//   create → submit → start-review → REJECT → revise (new rev) → resubmit → review → APPROVE
//         → transmit (→ doccontrol transmittal reactor) → close (immutable).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G-32 engineering drawing workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'eng-e2e', companyId: null, actorId: null, correlationId: 'e2e-g32' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const B = '/api/v1/engineering';

  it('enforces the lifecycle and records every transition end-to-end', async () => {
    // 1. Create the drawing at Rev 0 / draft.
    const created = (
      await http.post(`${B}/drawings`).send({ projectId: 'proj-1', code: 'ELV-CCTV-001', title: 'CCTV Layout — Ground Floor' }).expect(201)
    ).body;
    expect(created.status).toBe('draft');
    expect(created.revision).toBe('0');
    const id0 = created.id;

    // Illegal: cannot approve straight from draft (no review yet) — the state machine refuses it.
    await http.post(`${B}/drawings/${id0}/review`).send({ outcome: 'approved' }).expect(409);

    // 2. Submit for review → a Submission record is created.
    await http.post(`${B}/drawings/${id0}/submit`).send({ recipient: 'Consultant', purpose: 'For Approval' }).expect(201);
    expect((await http.get(`${B}/drawings/${id0}`).expect(200)).body.status).toBe('submitted');
    const subs = (await http.get(`${B}/drawings/${id0}/submissions`).expect(200)).body;
    expect(subs).toHaveLength(1);
    expect(subs[0].recipient).toBe('Consultant');

    // 3. Reviewer picks it up → under_review.
    await http.post(`${B}/drawings/${id0}/start-review`).send({}).expect(201);
    expect((await http.get(`${B}/drawings/${id0}`).expect(200)).body.status).toBe('under_review');

    // 4. REJECT with a mandatory comment → a Review record is created; a comment-less reject is 400.
    await http.post(`${B}/drawings/${id0}/review`).send({ outcome: 'rejected' }).expect(400);
    await http.post(`${B}/drawings/${id0}/review`).send({ outcome: 'rejected', comments: 'Camera coverage insufficient at L02 corridor.' }).expect(201);
    expect((await http.get(`${B}/drawings/${id0}`).expect(200)).body.status).toBe('rejected');
    const reviews = (await http.get(`${B}/drawings/${id0}/reviews`).expect(200)).body;
    expect(reviews[0].outcome).toBe('rejected');
    expect(reviews[0].comments).toMatch(/coverage/i);

    // 5. Revise → NEW Rev 1 draft; the source Rev 0 is superseded (immutable history, not overwrite).
    const revised = (await http.post(`${B}/drawings/${id0}/revise`).send({ reason: 'Add cameras at L02 corridor' }).expect(201)).body;
    expect(revised.revision).toBe('1');
    expect(revised.status).toBe('draft');
    expect(revised.previousRevision).toBe('0');
    expect(revised.id).not.toBe(id0);
    const id1 = revised.id;
    expect((await http.get(`${B}/drawings/${id0}`).expect(200)).body.status).toBe('superseded');

    // Revision lineage shows both revisions.
    const lineage = (await http.get(`${B}/drawings/revisions?projectId=proj-1&code=ELV-CCTV-001`).expect(200)).body;
    expect(lineage.map((d: { revision: string }) => d.revision).sort()).toEqual(['0', '1']);

    // 6. Resubmit Rev 1 → review → APPROVE.
    await http.post(`${B}/drawings/${id1}/submit`).send({ purpose: 'For Approval' }).expect(201);
    await http.post(`${B}/drawings/${id1}/start-review`).send({}).expect(201);
    await http.post(`${B}/drawings/${id1}/review`).send({ outcome: 'approved', comments: 'Coverage now compliant.' }).expect(201);
    expect((await http.get(`${B}/drawings/${id1}`).expect(200)).body.status).toBe('approved');

    // 7. Transmit → drawing goes transmitted AND the doccontrol reactor creates a Transmittal,
    //    whose reference is linked back onto the drawing.
    await http.post(`${B}/drawings/${id1}/transmit`).send({ recipient: 'Consultant', purpose: 'For Construction' }).expect(201);
    const transmitted = (await http.get(`${B}/drawings/${id1}`).expect(200)).body;
    expect(transmitted.status).toBe('transmitted');
    const transmittals = (await http.get('/api/v1/doccontrol/transmittals').expect(200)).body;
    const list = Array.isArray(transmittals) ? transmittals : (transmittals.items ?? []);
    expect(list.some((t: { title?: string }) => (t.title ?? '').includes('ELV-CCTV-001'))).toBe(true);
    expect(transmitted.transmittalRef).toBeTruthy();

    // 8. Close → closed and immutable (a further submit is refused by the state machine).
    await http.post(`${B}/drawings/${id1}/close`).send({}).expect(201);
    expect((await http.get(`${B}/drawings/${id1}`).expect(200)).body.status).toBe('closed');
    await http.post(`${B}/drawings/${id1}/submit`).send({}).expect(409);
  });
});
