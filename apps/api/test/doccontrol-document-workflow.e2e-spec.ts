// AURA OS — G-33 Document Control workflow, e2e (HTTP).
//
// The complete governed journey over the wire, proving the state machines are enforced and every
// stage leaves an immutable record:
//   create doc (Rev A draft) → submit → review → REJECT (reason) → new Rev B → submit → review
//     → APPROVE → ISSUE (register updates, Rev A superseded)
//   → transmittal: create (draft) → add Rev B → send → receive → acknowledge (record)
//   → verify revision history + an illegal transition.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G-33 Document Control workflow (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'dc-e2e', companyId: null, actorId: null, correlationId: 'e2e-g33' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const B = '/api/v1/doccontrol';
  const revs = (registerId: string) => http.get(`${B}/register/${registerId}/revisions`).expect(200).then((r) => r.body);

  it('enforces the document + transmittal lifecycles and records every step', async () => {
    // 1. Create the document — register header + Rev A draft revision.
    const entry = (
      await http.post(`${B}/register`).send({ projectId: 'proj-1', documentNumber: 'ELV-SPEC-001', title: 'CCTV Specification', discipline: 'elv' }).expect(201)
    ).body;
    expect(entry.currentRevision).toBe('A');
    const registerId = entry.id;

    let revisions = await revs(registerId);
    expect(revisions).toHaveLength(1);
    const revA = revisions[0];
    expect(revA.status).toBe('draft');

    // Illegal: cannot approve straight from draft (state machine → 409).
    await http.post(`${B}/revisions/${revA.id}/approve`).send({}).expect(409);

    // 2. Submit → review → REJECT (reason mandatory: a reasonless reject is 400).
    await http.post(`${B}/revisions/${revA.id}/submit`).send({}).expect(201);
    await http.post(`${B}/revisions/${revA.id}/start-review`).send({}).expect(201);
    await http.post(`${B}/revisions/${revA.id}/reject`).send({}).expect(400);
    await http.post(`${B}/revisions/${revA.id}/reject`).send({ reason: 'Camera schedule incomplete' }).expect(201);
    expect((await http.get(`${B}/revisions/${revA.id}`).expect(200)).body.status).toBe('rejected');

    // 3. Raise the next revision (B, draft). Rev A stays immutable in history.
    const revB = (await http.post(`${B}/revisions/${revA.id}/revise`).send({ reason: 'Complete the camera schedule' }).expect(201)).body;
    expect(revB.revision).toBe('B');
    expect(revB.status).toBe('draft');
    expect(revB.previousRevision).toBe('A');

    // 4. Rev B: submit → review → APPROVE → ISSUE.
    await http.post(`${B}/revisions/${revB.id}/submit`).send({}).expect(201);
    await http.post(`${B}/revisions/${revB.id}/start-review`).send({}).expect(201);
    await http.post(`${B}/revisions/${revB.id}/approve`).send({ comments: 'Approved for construction' }).expect(201);
    await http.post(`${B}/revisions/${revB.id}/issue`).send({}).expect(201);
    expect((await http.get(`${B}/revisions/${revB.id}`).expect(200)).body.status).toBe('issued');

    // Issuing updates the register header to Rev B / for_construction.
    const afterIssue = (await http.get(`${B}/register`).expect(200)).body.find((e: { id: string }) => e.id === registerId);
    expect(afterIssue.currentRevision).toBe('B');
    expect(afterIssue.status).toBe('for_construction');

    // Immutable: an issued revision cannot be re-submitted (409).
    await http.post(`${B}/revisions/${revB.id}/submit`).send({}).expect(409);

    // 5. Transmittal lifecycle: create (draft) → add Rev B item → send → receive → acknowledge.
    const tr = (await http.post(`${B}/transmittals`).send({ projectId: 'proj-1', code: 'TR-001', title: 'Issue ELV-SPEC-001 Rev B' }).expect(201)).body;
    expect(tr.status).toBe('draft');
    await http.post(`${B}/transmittals/${tr.id}/items`).send({ items: [{ registerEntryId: registerId, revision: 'B', purpose: 'for_construction' }] }).expect(201);
    // Illegal: cannot acknowledge a draft transmittal (409).
    await http.put(`${B}/transmittals/${tr.id}/acknowledge`).send({}).expect(409);
    await http.post(`${B}/transmittals/${tr.id}/send`).send({}).expect(201);
    await http.post(`${B}/transmittals/${tr.id}/receive`).send({}).expect(201);
    await http.put(`${B}/transmittals/${tr.id}/acknowledge`).send({ note: 'Received by consultant' }).expect(200);
    expect((await http.get(`${B}/transmittals`).expect(200)).body.find((t: { id: string }) => t.id === tr.id).status).toBe('acknowledged');

    // An acknowledgement record exists (the conveyance audit trail).
    const acks = (await http.get(`${B}/transmittals/${tr.id}/acknowledgements`).expect(200)).body;
    expect(acks).toHaveLength(1);
    expect(acks[0].note).toBe('Received by consultant');

    // 6. Revision history: Rev A (rejected — kept immutable) and Rev B (issued) both preserved.
    revisions = await revs(registerId);
    const byRev = Object.fromEntries(revisions.map((r: { revision: string; status: string }) => [r.revision, r.status]));
    expect(byRev).toEqual({ A: 'rejected', B: 'issued' });

    // 7. Second issue cycle proves supersede-on-issue: Rev C issued ⇒ Rev B → superseded.
    const revC = (await http.post(`${B}/revisions/${revB.id}/revise`).send({ reason: 'As-built update' }).expect(201)).body;
    expect(revC.revision).toBe('C');
    await http.post(`${B}/revisions/${revC.id}/submit`).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/start-review`).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/approve`).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/issue`).send({}).expect(201);
    const finalByRev = Object.fromEntries(
      (await revs(registerId)).map((r: { revision: string; status: string }) => [r.revision, r.status]),
    );
    expect(finalByRev).toEqual({ A: 'rejected', B: 'superseded', C: 'issued' });
  });
});
