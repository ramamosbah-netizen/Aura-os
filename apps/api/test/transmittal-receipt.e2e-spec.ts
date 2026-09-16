// AURA OS — ENG-05 and ENG-06: a conveyance goes to people, and only they can say it arrived.
//
// Two frozen criteria, deliberately proven apart even though they share one mechanism:
//
//   ENG-05  attach the exact controlled register revision(s), send once, show recipient
//           receipt/acknowledgement, and retain revision/purpose lineage under representative
//           project and functional permissions.
//
//   ENG-06  repeat the governed release with a separate Design issuer and assigned Site Engineer,
//           Project Engineer and Procurement recipients; prove only authorized recipients see and
//           accept their exact drawing or material revision, and retain receipt history.
//
// The gap both rested on: `recipient` was one free-text field, and acknowledging checked a
// permission and nothing else — so any holder could sign for a document addressed to somebody else,
// and the register read as delivered. A receipt signed by a person who was never sent the document
// is not a receipt; it is a second person's opinion that it probably arrived.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `transmittal-tenant-${Date.now()}`;

interface Transmittal { id: string; code: string; status: string; sender: string | null; recipient: string | null; purpose: string | null }
interface Recipient { id: string; userId: string; party: string; acknowledgedAt: string | null; acknowledgedNote: string | null }
interface Receipt { recipients: Recipient[]; acknowledgedCount: number; fullyAcknowledged: boolean; outstanding: Recipient[] }
interface Item { registerEntryId: string; documentNumber: string; revision: string; purpose: string }

describe('ENG-05 — a controlled package, sent once, with receipts (JWT ON)', () => {
  let app: INestApplication;
  let controller: ReturnType<typeof request.agent>;
  let site: ReturnType<typeof request.agent>;
  let buyer: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let projectId: string;
  let transmittalId: string;
  let registerEntryId: string;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'transmittal-receipt-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // The document controller issues; the recipients receive. `outsider` holds the SAME acknowledge
    // permission as the recipients and is simply not on the distribution — which is the whole point.
    access.registerRole({
      id: 'r-e2e-doc-controller', name: 'Document Controller (e2e)',
      permissions: ['doccontrol.*', 'projects.project.read', 'work-items.*'],
    });
    access.registerRole({
      id: 'r-e2e-doc-recipient', name: 'Recipient (e2e)',
      permissions: ['doccontrol.transmittal.read', 'doccontrol.transmittal.acknowledge', 'projects.project.read', 'work-items.*'],
    });
    access.grant({ userId: 'dc-controller', roleId: 'r-e2e-doc-controller', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    for (const userId of ['dc-site', 'dc-buyer', 'dc-outsider']) {
      access.grant({ userId, roleId: 'r-e2e-doc-recipient', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    }
    access.grant({ userId: 'dc-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
    for (const userId of ['dc-controller', 'dc-site', 'dc-buyer', 'dc-outsider', 'dc-admin']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    controller = agent('dc-controller');
    site = agent('dc-site');
    buyer = agent('dc-buyer');
    outsider = agent('dc-outsider');
    projectId = (await agent('dc-admin').post('/api/v1/projects/projects').send({ title: 'Transmittal job' }).expect(201)).body.id;

    const entry = (await controller.post('/api/v1/doccontrol/register').send({
      projectId, documentNumber: 'E-101', title: 'Level 3 containment layout', discipline: 'elv',
    }).expect(201)).body as { id: string };
    registerEntryId = entry.id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  const receipt = async (): Promise<Receipt> =>
    (await controller.get(`/api/v1/doccontrol/transmittals/${transmittalId}/receipt`).expect(200)).body as Receipt;

  it('drafts a conveyance with its purpose', async () => {
    const created = (await controller.post('/api/v1/doccontrol/transmittals').send({
      projectId, code: `TR-${Date.now()}`, title: 'Level 3 containment — for construction',
      sender: 'Engineering', recipient: 'Site team', purpose: 'For Construction',
    }).expect(201)).body as Transmittal;
    transmittalId = created.id;
    expect(created).toMatchObject({ status: 'draft', purpose: 'For Construction' });
  });

  it('attaches the EXACT controlled register revision', async () => {
    // Snapshotted at conveyance time, not joined: what was sent must stay readable after the
    // register moves on to the next revision.
    // The document number, title and revision are snapshotted FROM THE REGISTER, not supplied by
    // the caller — so a package cannot claim a revision the controlled record never had.
    const added = (await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/items`).send({
      items: [{ registerEntryId, revision: 'C', purpose: 'for_construction' }],
    }).expect(201)).body as Item[];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ registerEntryId, documentNumber: 'E-101', revision: 'C', purpose: 'for_construction' });
  });

  it('carries more than one document in the same package', async () => {
    const second = (await controller.post('/api/v1/doccontrol/register').send({
      projectId, documentNumber: 'E-102', title: 'Level 3 cable schedule', discipline: 'elv',
    }).expect(201)).body as { id: string };
    await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/items`).send({
      items: [{ registerEntryId: second.id, revision: 'A', purpose: 'for_construction' }],
    }).expect(201);

    const items = (await controller.get(`/api/v1/doccontrol/transmittals/${transmittalId}/items`).expect(200)).body as Item[];
    expect(items.map((i) => i.documentNumber).sort()).toEqual(['E-101', 'E-102']);
    // Each keeps its OWN revision: a package is not one revision applied to several drawings.
    expect(items.find((i) => i.documentNumber === 'E-101')!.revision).toBe('C');
    expect(items.find((i) => i.documentNumber === 'E-102')!.revision).toBe('A');
  });

  it('addresses it to named people, in the capacity they receive in', async () => {
    await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/recipients`)
      .send({ userId: 'dc-site', party: 'site_engineer' }).expect(201);
    await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/recipients`)
      .send({ userId: 'dc-buyer', party: 'procurement' }).expect(201);

    const state = await receipt();
    expect(state.recipients.map((r) => r.party).sort()).toEqual(['procurement', 'site_engineer']);
    // Nobody has answered yet, and an unanswered distribution is NOT receipt.
    expect(state).toMatchObject({ acknowledgedCount: 0, fullyAcknowledged: false });
  });

  it('refuses the same person twice on one conveyance', async () => {
    await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/recipients`)
      .send({ userId: 'dc-site', party: 'site_engineer' }).expect(409);
  });

  it('sends it once, and refuses a second send', async () => {
    await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/send`).expect(201);
    const resent = await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/send`);
    expect(resent.status).toBe(409);
  });

  it('refuses to widen the distribution after it was sent', async () => {
    // What was conveyed is what was conveyed. Adding somebody now would leave a receipt list that
    // no longer matches the act it records.
    const late = await controller.post(`/api/v1/doccontrol/transmittals/${transmittalId}/recipients`)
      .send({ userId: 'dc-outsider', party: 'other' });
    expect(late.status).toBe(409);
    expect(late.body.message).toMatch(/can only be added to a draft/);
  });

  it('refuses an acknowledgement from somebody it was never sent to', async () => {
    // `dc-outsider` holds the SAME acknowledge permission as the recipients. Permission says you are
    // the kind of person who acknowledges; being on the distribution says this one was sent to you.
    // A CONFLICT rather than bad input: the request is well formed, and it is who this actor IS
    // relative to the distribution that forbids it.
    const refused = await outsider.put(`/api/v1/doccontrol/transmittals/${transmittalId}/acknowledge`).send({ note: 'got it' });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/only a named recipient can acknowledge it/);
    expect((await receipt()).acknowledgedCount).toBe(0);
  });

  it('records one recipient answering — and does NOT call that receipt', async () => {
    await site.put(`/api/v1/doccontrol/transmittals/${transmittalId}/acknowledge`).send({ note: 'received on site' }).expect(200);

    const state = await receipt();
    expect(state).toMatchObject({ acknowledgedCount: 1, fullyAcknowledged: false });
    expect(state.outstanding.map((r) => r.userId)).toEqual(['dc-buyer']);
    expect(state.recipients.find((r) => r.userId === 'dc-site')!.acknowledgedNote).toBe('received on site');

    // ONE PERSON CONFIRMING IS NOT TWO: the conveyance has not advanced.
    const current = (await controller.get('/api/v1/doccontrol/transmittals').expect(200)).body as Transmittal[];
    expect(current.find((t) => t.id === transmittalId)!.status).not.toBe('acknowledged');
  });

  it('refuses the same recipient acknowledging twice', async () => {
    const again = await site.put(`/api/v1/doccontrol/transmittals/${transmittalId}/acknowledge`).send({});
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already acknowledged/);
  });

  it('reaches acknowledged only when the LAST recipient answers', async () => {
    await buyer.put(`/api/v1/doccontrol/transmittals/${transmittalId}/acknowledge`).send({ note: 'noted for ordering' }).expect(200);

    const state = await receipt();
    expect(state).toMatchObject({ acknowledgedCount: 2, fullyAcknowledged: true });
    expect(state.outstanding).toEqual([]);

    const current = (await controller.get('/api/v1/doccontrol/transmittals').expect(200)).body as Transmittal[];
    expect(current.find((t) => t.id === transmittalId)!.status).toBe('acknowledged');
  });

  it('retains the receipt history, per person', async () => {
    const history = (await controller.get(`/api/v1/doccontrol/transmittals/${transmittalId}/acknowledgements`).expect(200)).body as
      Array<{ acknowledgedBy: string | null; note: string | null }>;
    expect(history.map((h) => h.acknowledgedBy).sort()).toEqual(['dc-buyer', 'dc-site']);
    expect(history.find((h) => h.acknowledgedBy === 'dc-buyer')!.note).toBe('noted for ordering');
  });

  it('retains the revision and purpose lineage after the conveyance closes', async () => {
    const items = (await controller.get(`/api/v1/doccontrol/transmittals/${transmittalId}/items`).expect(200)).body as Item[];
    expect(items.find((i) => i.documentNumber === 'E-101')).toMatchObject({ revision: 'C', purpose: 'for_construction' });
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).get(`/api/v1/doccontrol/transmittals/${transmittalId}/receipt`).expect(401);
  });
});

/**
 * ENG-06 — the governed release, with a separate Design issuer and three named recipients.
 *
 * The frozen criterion asks for the release to be repeated with a Design issuer who is NOT the
 * recipient, with an assigned Site Engineer, Project Engineer and Buyer, and for only those people
 * to be able to accept their exact drawing revision — with the receipt history retained.
 *
 * Proven separately from ENG-05 on purpose. They share the distribution mechanism, and sharing a
 * mechanism is not sharing a criterion: ENG-05 is about a controlled PACKAGE and its lineage,
 * this is about a RELEASE reaching named operational roles who then answer for themselves.
 */
describe('ENG-06 — a release reaches named roles, and only they accept it (JWT ON)', () => {
  let app: INestApplication;
  let design: ReturnType<typeof request.agent>;
  let siteEngineer: ReturnType<typeof request.agent>;
  let projectEngineer: ReturnType<typeof request.agent>;
  let procurement: ReturnType<typeof request.agent>;
  let bystander: ReturnType<typeof request.agent>;
  let projectId: string;
  let drawingId: string;
  let transmittalCode: string;
  const AUTH_TENANT = `release-tenant-${Date.now()}`;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'release-receipt-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // The ISSUER is Design and is deliberately not on the distribution: a release nobody outside
    // Design has to accept is an announcement, not a handover.
    access.registerRole({
      id: 'r-e2e-release-design', name: 'Design (e2e)',
      permissions: ['engineering.*', 'doccontrol.*', 'projects.*', 'work-items.*'],
    });
    access.registerRole({
      id: 'r-e2e-release-recipient', name: 'Release recipient (e2e)',
      permissions: ['doccontrol.transmittal.read', 'doccontrol.transmittal.acknowledge', 'projects.project.read', 'work-items.*'],
    });
    access.grant({ userId: 'rl-design', roleId: 'r-e2e-release-design', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    for (const userId of ['rl-site', 'rl-pe', 'rl-buyer', 'rl-bystander']) {
      access.grant({ userId, roleId: 'r-e2e-release-recipient', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    }
    for (const userId of ['rl-design', 'rl-site', 'rl-pe', 'rl-buyer', 'rl-bystander']) {
      users.save({ tenantId: AUTH_TENANT, userId, displayName: userId, active: true });
    }

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: AUTH_TENANT })}`);
    design = agent('rl-design');
    siteEngineer = agent('rl-site');
    projectEngineer = agent('rl-pe');
    procurement = agent('rl-buyer');
    bystander = agent('rl-bystander');

    projectId = (await design.post('/api/v1/projects/projects').send({ title: 'Release job' }).expect(201)).body.id;
    drawingId = (await design.post('/api/v1/engineering/drawings').send({
      projectId, code: 'E-301', title: 'Level 5 containment', discipline: 'elv',
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /** The conveyance the release produced, found by the drawing it carries. */
  const releaseTransmittal = async (): Promise<Transmittal> => {
    const all = (await design.get('/api/v1/doccontrol/transmittals').expect(200)).body as Transmittal[];
    const found = all.find((t) => t.code.includes(drawingId));
    expect(found, 'the release produced no conveyance').toBeDefined();
    return found!;
  };
  const receiptOfRelease = async (id: string): Promise<Receipt> =>
    (await design.get(`/api/v1/doccontrol/transmittals/${id}/receipt`).expect(200)).body as Receipt;

  it('issues the release from Design to three named operational roles', async () => {
    // draft → submitted → under_review → approved → transmitted, each step its own governed act.
    await design.post(`/api/v1/engineering/drawings/${drawingId}/submit`).send({}).expect(201);
    await design.post(`/api/v1/engineering/drawings/${drawingId}/start-review`).send({}).expect(201);
    await design.post(`/api/v1/engineering/drawings/${drawingId}/review`).send({ outcome: 'approved' }).expect(201);
    await design.post(`/api/v1/engineering/drawings/${drawingId}/transmit`).send({
      recipient: 'Site distribution', purpose: 'For Information',
      recipients: [
        { userId: 'rl-site', party: 'site_engineer' },
        { userId: 'rl-pe', party: 'project_engineer' },
        { userId: 'rl-buyer', party: 'procurement' },
      ],
    }).expect(201);

    const transmittal = await releaseTransmittal();
    transmittalCode = transmittal.code;
    // The issuer is Design, and the conveyance has left.
    expect(transmittal.sender).toBe('Engineering');
    expect(transmittal.status).toBe('sent');

    const receipt = await receiptOfRelease(transmittal.id);
    expect(receipt.recipients.map((r) => r.party).sort()).toEqual(['procurement', 'project_engineer', 'site_engineer']);
    expect(receipt).toMatchObject({ acknowledgedCount: 0, fullyAcknowledged: false });
  });

  it('refuses acceptance from somebody who was not on the distribution', async () => {
    // `rl-bystander` holds exactly the same acknowledge permission as the three recipients.
    const transmittal = await releaseTransmittal();
    const refused = await bystander.put(`/api/v1/doccontrol/transmittals/${transmittal.id}/acknowledge`).send({});
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/only a named recipient can acknowledge it/);
    expect((await receiptOfRelease(transmittal.id)).acknowledgedCount).toBe(0);
  });

  it('lets each named role accept for themselves, and for nobody else', async () => {
    const transmittal = await releaseTransmittal();
    await siteEngineer.put(`/api/v1/doccontrol/transmittals/${transmittal.id}/acknowledge`).send({ note: 'on site' }).expect(200);

    const afterOne = await receiptOfRelease(transmittal.id);
    expect(afterOne).toMatchObject({ acknowledgedCount: 1, fullyAcknowledged: false });
    // Site accepting did NOT accept on behalf of the Project Engineer or the Buyer.
    expect(afterOne.outstanding.map((r) => r.party).sort()).toEqual(['procurement', 'project_engineer']);

    await projectEngineer.put(`/api/v1/doccontrol/transmittals/${transmittal.id}/acknowledge`).send({}).expect(200);
    const afterTwo = await receiptOfRelease(transmittal.id);
    expect(afterTwo).toMatchObject({ acknowledgedCount: 2, fullyAcknowledged: false });
    expect(afterTwo.outstanding.map((r) => r.userId)).toEqual(['rl-buyer']);
  });

  it('reaches the Buyer, and closes only when they answer too', async () => {
    const transmittal = await releaseTransmittal();
    await procurement.put(`/api/v1/doccontrol/transmittals/${transmittal.id}/acknowledge`).send({ note: 'noted for ordering' }).expect(200);

    const receipt = await receiptOfRelease(transmittal.id);
    expect(receipt).toMatchObject({ acknowledgedCount: 3, fullyAcknowledged: true });

    const current = (await design.get('/api/v1/doccontrol/transmittals').expect(200)).body as Transmittal[];
    expect(current.find((t) => t.code === transmittalCode)!.status).toBe('acknowledged');
  });

  it('retains the receipt history, naming each role that accepted', async () => {
    const transmittal = await releaseTransmittal();
    const history = (await design.get(`/api/v1/doccontrol/transmittals/${transmittal.id}/acknowledgements`).expect(200)).body as
      Array<{ acknowledgedBy: string | null; note: string | null }>;
    expect(history.map((h) => h.acknowledgedBy).sort()).toEqual(['rl-buyer', 'rl-pe', 'rl-site']);
    expect(history.find((h) => h.acknowledgedBy === 'rl-buyer')!.note).toBe('noted for ordering');

    // …and each person's own receipt carries their own answer, not a shared one.
    const receipt = await receiptOfRelease(transmittal.id);
    expect(receipt.recipients.find((r) => r.party === 'site_engineer')!.acknowledgedNote).toBe('on site');
    expect(receipt.recipients.find((r) => r.party === 'project_engineer')!.acknowledgedNote).toBeNull();
  });

  it('conveys the EXACT drawing revision the release was for', async () => {
    const transmittal = await releaseTransmittal();
    // The conveyance code is derived from the immutable drawing-revision identity, so what was
    // released cannot drift from what the register later becomes.
    expect(transmittal.code).toContain(drawingId);
    expect(transmittal.title).toContain('E-301');
  });
});
