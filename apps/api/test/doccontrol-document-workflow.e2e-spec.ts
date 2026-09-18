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
import { AccessService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G-33 Document Control workflow (HTTP)', () => {
  const AUTHOR = 'u-technical-engineer';
  const APPROVER = 'u-technical-manager';
  const CONTROLLER = 'u-document-controller';
  /** Who is making this request. Wave C: the answer is never "nobody" again. */
  const as = (actor: string) => ({ 'x-e2e-actor': actor });

  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    // THREE PEOPLE, NOT ONE ACTORLESS SESSION. This shim used to bind `actorId: null` for every
    // request, so the whole lifecycle ran as nobody — which is precisely the state SEC-01 wave C
    // found and now refuses: an approval will not proceed over a review that recorded no one, the
    // submitter may not approve, and the approver may not issue. Reading the actor off a header lets
    // the spec drive the journey as the three roles that actually perform it. It is a TEST SHIM and
    // not a security boundary — authorization itself is proved Auth-ON in
    // release-authority.security.test.ts and against the running API; what this file proves is the
    // LIFECYCLE over HTTP, which is a different question and needs actors to ask at all.
    app.use((req: { headers?: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
      const raw = req.headers?.['x-e2e-actor'];
      const actorId = (Array.isArray(raw) ? raw[0] : raw) ?? null;
      tenant.run({ tenantId: 'dc-e2e', companyId: null, actorId, correlationId: 'e2e-g33' }, () => next());
    });
    await app.init();

    // REAL SEEDED ROLES, GRANTED TO THE THREE PRINCIPALS. Naming an actor is what makes the service
    // assertions RUN at all — they are written `if (actorId)`, so the actorless version of this spec
    // skipped every permission check in the module and proved only the state machine. With names
    // supplied and no grants, everything would 403; with the shipped roles granted, each act is
    // performed by somebody the catalogue says may perform it.
    const access = app.get(AccessService);
    access.seedStandardRoles();
    for (const [userId, roleId] of [
      [AUTHOR, 'r-technical-engineer'],
      [APPROVER, 'r-technical-manager'],
      [CONTROLLER, 'r-document-controller'],
    ] as const) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: 'dc-e2e' } });
    }

    http = request(app.getHttpServer());
    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Workflow fixture project' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const B = '/api/v1/doccontrol';
  const revs = (registerId: string) => http.get(`${B}/register/${registerId}/revisions`).expect(200).then((r) => r.body);

  it('enforces the document + transmittal lifecycles and records every step', async () => {
    // 1. Create the document — register header + Rev A draft revision.
    const entry = (
      await http.post(`${B}/register`).send({ projectId: projectId, documentNumber: 'ELV-SPEC-001', title: 'CCTV Specification', discipline: 'elv' }).expect(201)
    ).body;
    expect(entry.currentRevision).toBe('A');
    const registerId = entry.id;

    let revisions = await revs(registerId);
    expect(revisions).toHaveLength(1);
    const revA = revisions[0];
    expect(revA.status).toBe('draft');

    // Illegal: cannot approve straight from draft (state machine → 409).
    await http.post(`${B}/revisions/${revA.id}/approve`).set(as(APPROVER)).send({}).expect(409);

    // 2. Submit → review → REJECT (reason mandatory: a reasonless reject is 400).
    await http.post(`${B}/revisions/${revA.id}/submit`).set(as(AUTHOR)).send({}).expect(201);
    await http.post(`${B}/revisions/${revA.id}/start-review`).set(as(APPROVER)).send({}).expect(201);
    await http.post(`${B}/revisions/${revA.id}/reject`).set(as(APPROVER)).send({}).expect(400);
    await http.post(`${B}/revisions/${revA.id}/reject`).set(as(APPROVER)).send({ reason: 'Camera schedule incomplete' }).expect(201);
    expect((await http.get(`${B}/revisions/${revA.id}`).expect(200)).body.status).toBe('rejected');

    // 3. Raise the next revision (B, draft). Rev A stays immutable in history.
    // RAISED BY THE DOCUMENT CONTROLLER, because `revisions/:id/revise` declares
    // `doccontrol.register.revise` — registry authority, not authorship. Whether raising the next
    // revision of a rejected drawing is the registrar's act or the author's is a fair question, and
    // wave C deliberately does not answer it: the register records it as NOT CLAIMED. This spec
    // asserts what the system currently says, which is the only thing a test can honestly assert.
    const revB = (await http.post(`${B}/revisions/${revA.id}/revise`).set(as(CONTROLLER)).send({ reason: 'Complete the camera schedule' }).expect(201)).body;
    expect(revB.revision).toBe('B');
    expect(revB.status).toBe('draft');
    expect(revB.previousRevision).toBe('A');

    // 4. Rev B: submit → review → APPROVE → ISSUE.
    await http.post(`${B}/revisions/${revB.id}/submit`).set(as(AUTHOR)).send({}).expect(201);
    await http.post(`${B}/revisions/${revB.id}/start-review`).set(as(APPROVER)).send({}).expect(201);
    // THE AUTHOR IS REFUSED THEIR OWN APPROVAL — 403, because the actor is wrong and nothing else.
    await http.post(`${B}/revisions/${revB.id}/approve`).set(as(AUTHOR)).send({}).expect(403);
    await http.post(`${B}/revisions/${revB.id}/approve`).set(as(APPROVER)).send({ comments: 'Approved for construction' }).expect(201);
    // AND THE APPROVER MAY NOT RELEASE WHAT THEY APPROVED. Approving a document internally and
    // issuing it outside the business are two acts, so they are two people.
    await http.post(`${B}/revisions/${revB.id}/issue`).set(as(APPROVER)).send({}).expect(403);
    await http.post(`${B}/revisions/${revB.id}/issue`).set(as(CONTROLLER)).send({}).expect(201);
    const issuedB = (await http.get(`${B}/revisions/${revB.id}`).expect(200)).body;
    expect(new Set([issuedB.submittedBy, issuedB.decidedBy, issuedB.issuedBy]).size, 'three acts, three names').toBe(3);
    expect(issuedB.reviewedBy, 'the review keeps its own name; approval never back-fills it').toBe(APPROVER);
    expect((await http.get(`${B}/revisions/${revB.id}`).expect(200)).body.status).toBe('issued');

    // Issuing updates the register header to Rev B / for_construction.
    const afterIssue = (await http.get(`${B}/register`).expect(200)).body.find((e: { id: string }) => e.id === registerId);
    expect(afterIssue.currentRevision).toBe('B');
    expect(afterIssue.status).toBe('for_construction');

    // Immutable: an issued revision cannot be re-submitted (409).
    await http.post(`${B}/revisions/${revB.id}/submit`).set(as(AUTHOR)).send({}).expect(409);

    // 5. Transmittal lifecycle: create (draft) → add Rev B item → send → receive → acknowledge.
    const tr = (await http.post(`${B}/transmittals`).set(as(CONTROLLER)).send({ projectId: projectId, code: 'TR-001', title: 'Issue ELV-SPEC-001 Rev B' }).expect(201)).body;
    expect(tr.status).toBe('draft');
    await http.post(`${B}/transmittals/${tr.id}/items`).set(as(CONTROLLER)).send({ items: [{ registerEntryId: registerId, revision: 'B', purpose: 'for_construction' }] }).expect(201);
    // Illegal: cannot acknowledge a draft transmittal (409).
    await http.put(`${B}/transmittals/${tr.id}/acknowledge`).send({}).expect(409);
    await http.post(`${B}/transmittals/${tr.id}/send`).set(as(CONTROLLER)).send({}).expect(201);
    const sent = (await http.get(`${B}/transmittals`).expect(200)).body.find((t: { id: string }) => t.id === tr.id);
    expect(sent.sentBy, 'the conveyance records who released it; it used to keep a timestamp and no name').toBe(CONTROLLER);
    expect(sent.kind, 'created through document control, so it is an external conveyance').toBe('external');
    // WHAT WAS CONVEYED CANNOT CHANGE AFTER THE CONVEYANCE. This returned 201 before wave C.
    await http.post(`${B}/transmittals/${tr.id}/items`).set(as(CONTROLLER))
      .send({ items: [{ registerEntryId: registerId, revision: 'B', purpose: 'for_information' }] }).expect(409);
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
    const revC = (await http.post(`${B}/revisions/${revB.id}/revise`).set(as(CONTROLLER)).send({ reason: 'As-built update' }).expect(201)).body;
    expect(revC.revision).toBe('C');
    await http.post(`${B}/revisions/${revC.id}/submit`).set(as(AUTHOR)).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/start-review`).set(as(APPROVER)).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/approve`).set(as(APPROVER)).send({}).expect(201);
    await http.post(`${B}/revisions/${revC.id}/issue`).set(as(CONTROLLER)).send({}).expect(201);
    const finalByRev = Object.fromEntries(
      (await revs(registerId)).map((r: { revision: string; status: string }) => [r.revision, r.status]),
    );
    expect(finalByRev).toEqual({ A: 'rejected', B: 'superseded', C: 'issued' });
  });
});
