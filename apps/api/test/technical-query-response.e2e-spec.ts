// AURA OS — ENG-03: a technical query RESPONSE is a design decision, over HTTP.
//
// A TQ is raised by the contractor to the consultant asking for a design clarification, and SITE
// THEN BUILDS TO THE ANSWER. That single fact is what everything below is about:
//
//   · the answer is attributable — who decided it is on the record, not only in an event log;
//   · replacing it costs a reason and KEEPS what it displaced, because "what were we told in March"
//     has to stay answerable after June's answer exists; March is what was built;
//   · the loop closes, and the person who gave the answer cannot be the one who declares it
//     adequate — otherwise the whole exchange is a note somebody wrote to themselves;
//   · and a closed decision cannot be rewritten underneath the people who acted on it.
//
// Proven with JWT ON throughout, because the authority split IS the capability here.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `tq-tenant-${Date.now()}`;

interface Tq {
  id: string; code: string; status: 'open' | 'responded' | 'closed';
  response: string | null; respondedAt: string | null; respondedBy: string | null;
  responseRevision: number; closedAt: string | null; closedBy: string | null;
  drawingId: string | null; projectId: string;
}
interface Revision {
  revision: number; response: string; respondedBy: string | null; supersededReason: string;
}

describe('a technical query response is a design decision (JWT ON)', () => {
  let app: INestApplication;
  let engineer: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  /** Holds BOTH permissions, to prove the domain refuses a self-close even then. */
  let both: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let projectId: string;
  let tqId: string;

  beforeAll(async () => {
    // Set before the container is built: AuthService reads the secret in a field initialiser.
    process.env.AUTH_JWT_SECRET = 'technical-query-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // Two real sides of the exchange. Bespoke roles so the only variables are the two permissions
    // under test; that the SHIPPED roles carry this same split is asserted over the role catalogue
    // itself in src/auth/elv-roles.test.ts.
    access.registerRole({
      id: 'r-e2e-tq-engineer', name: 'Design Engineer (e2e)',
      // Raises and CLOSES; cannot answer.
      permissions: ['engineering.tq.create', 'engineering.tq.read', 'engineering.tq.close', 'engineering.drawing.*', 'projects.project.read'],
    });
    access.registerRole({
      id: 'r-e2e-tq-manager', name: 'Technical Manager (e2e)',
      // Answers; cannot close its own answer — and holds no close permission at all.
      permissions: ['engineering.tq.read', 'engineering.tq.respond', 'projects.project.read'],
    });
    access.grant({ userId: 'tq-engineer', roleId: 'r-e2e-tq-engineer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'tq-manager', roleId: 'r-e2e-tq-manager', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.registerRole({
      id: 'r-e2e-tq-both', name: 'Holds both (e2e)',
      // Deliberately over-privileged: the point is that PERMISSION is not the only guard here.
      permissions: ['engineering.tq.read', 'engineering.tq.respond', 'engineering.tq.close', 'engineering.tq.create', 'projects.project.read'],
    });
    access.grant({ userId: 'tq-both', roleId: 'r-e2e-tq-both', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'tq-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
    for (const userId of ['tq-engineer', 'tq-manager', 'tq-both', 'tq-admin']) {
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
    engineer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'tq-engineer', tenantId: TENANT })}`);
    manager = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'tq-manager', tenantId: TENANT })}`);
    both = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'tq-both', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'tq-admin', tenantId: TENANT })}`);

    projectId = (await admin.post('/api/v1/projects/projects').send({ title: 'TQ job' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  const get = async (id: string): Promise<Tq> =>
    (await engineer.get(`/api/v1/engineering/technical-queries/${id}`).expect(200)).body as Tq;

  it('raises one open, unanswered and unattributed', async () => {
    const raised = (await engineer.post('/api/v1/engineering/technical-queries').send({
      projectId, code: 'TQ-001', title: 'Riser clashes with duct',
      query: 'Which service takes precedence at level 3?', timeImpact: true,
    }).expect(201)).body as Tq;
    tqId = raised.id;
    expect(raised).toMatchObject({
      status: 'open', response: null, respondedBy: null, responseRevision: 0, closedAt: null,
    });
  });

  it('is raised OPEN however the caller labels it', async () => {
    // A query created as `responded` would carry a status its own empty response contradicts. The
    // route never forwards a caller-supplied status, and the domain refuses one outright for any
    // other caller (see domain/technical-query-response.test.ts) — so what HTTP can assert is the
    // outcome: the label is ignored and the query is open, unanswered.
    const born = (await engineer.post('/api/v1/engineering/technical-queries').send({
      projectId, code: 'TQ-BORN', title: 'Born answered', query: 'q', status: 'responded',
    }).expect(201)).body as Tq;
    expect(born).toMatchObject({ status: 'open', response: null, respondedBy: null });
  });

  it('refuses a drawing from another project as its canonical link', async () => {
    // Free-text `drawingReference` can name anything; an ID that resolved to another project's
    // drawing would be worse — a query that LOOKS linked and points somewhere else.
    const other = (await admin.post('/api/v1/projects/projects').send({ title: 'Somebody else' }).expect(201)).body.id;
    const theirDrawing = (await engineer.post('/api/v1/engineering/drawings').send({
      projectId: other, code: 'E-999', title: 'Theirs', discipline: 'elv',
    }).expect(201)).body;
    const refused = await engineer.post('/api/v1/engineering/technical-queries').send({
      projectId, code: 'TQ-XPROJ', title: 'Borrowed drawing', query: 'q', drawingId: theirDrawing.id,
    }).expect(400);
    expect(refused.body.message).toMatch(/does not belong to project/);
  });

  it('refuses the raising engineer the act of ANSWERING it', async () => {
    // The design decision is the Technical Manager's to give. This is the whole separation.
    await engineer.put(`/api/v1/engineering/technical-queries/${tqId}/respond`)
      .send({ response: 'I will just decide this myself.' }).expect(403);
  });

  it('lets the Technical Manager answer, and records WHO decided it', async () => {
    const answered = (await manager.put(`/api/v1/engineering/technical-queries/${tqId}/respond`)
      .send({ response: 'Duct takes precedence. Reroute riser east of grid C.' }).expect(200)).body as Tq;
    expect(answered).toMatchObject({
      status: 'responded', respondedBy: 'tq-manager', responseRevision: 0,
      response: 'Duct takes precedence. Reroute riser east of grid C.',
    });
    expect(answered.respondedAt).not.toBeNull();
    // Reloaded from the API rather than read off the response that wrote it.
    expect(await get(tqId)).toMatchObject({ respondedBy: 'tq-manager', status: 'responded' });
  });

  it('refuses to replace that answer without a reason', async () => {
    // Site builds to this. An answer that changed silently means work done to an instruction that
    // no longer exists anywhere, with nothing to show it ever did.
    const refused = await manager.put(`/api/v1/engineering/technical-queries/${tqId}/respond`)
      .send({ response: 'Actually, reroute west.' }).expect(409);
    expect(refused.body.message).toMatch(/replacing a design response requires a reason/);
  });

  it('replaces it with a reason, and KEEPS what it displaced', async () => {
    const replaced = (await manager.put(`/api/v1/engineering/technical-queries/${tqId}/respond`).send({
      response: 'Reroute riser WEST of grid C.',
      supersededReason: 'consultant revised after coordination review 2026-04-02',
    }).expect(200)).body as Tq;
    expect(replaced).toMatchObject({ response: 'Reroute riser WEST of grid C.', responseRevision: 1 });

    // "What were we told in March" stays answerable — that is what was built.
    const history = (await engineer.get(`/api/v1/engineering/technical-queries/${tqId}/responses`).expect(200)).body as Revision[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      revision: 0,
      response: 'Duct takes precedence. Reroute riser east of grid C.',
      respondedBy: 'tq-manager',
      supersededReason: 'consultant revised after coordination review 2026-04-02',
    });
  });

  it('refuses the answering manager the act of closing, on the permission', async () => {
    // This e2e's Technical Manager role holds no close authority at all, so the guard stops it
    // before any rule runs. That is the first of two independent defences.
    await manager.put(`/api/v1/engineering/technical-queries/${tqId}/close`).expect(403);
  });

  it('refuses a self-close even from somebody holding BOTH permissions', async () => {
    // The second defence, and the one that actually matters: permission is not the guarantee here.
    // A principal entitled to answer AND to close still cannot declare their own answer adequate,
    // because that would make the whole exchange a note somebody wrote to themselves.
    const own = (await both.post('/api/v1/engineering/technical-queries').send({
      projectId, code: 'TQ-SELF', title: 'Answered by the closer', query: 'Who decides this?',
    }).expect(201)).body as Tq;
    await both.put(`/api/v1/engineering/technical-queries/${own.id}/respond`)
      .send({ response: 'I decide it.' }).expect(200);

    const refused = await both.put(`/api/v1/engineering/technical-queries/${own.id}/close`).expect(409);
    expect(refused.body.message).toMatch(/only somebody other than the person who answered/);

    // …and somebody else closing the same answer is fine, which is the point of the rule.
    const closed = (await engineer.put(`/api/v1/engineering/technical-queries/${own.id}/close`).expect(200)).body as Tq;
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'tq-engineer', respondedBy: 'tq-both' });
  });

  it('lets the raising engineer accept it as adequate to build to', async () => {
    const closed = (await engineer.put(`/api/v1/engineering/technical-queries/${tqId}/close`).expect(200)).body as Tq;
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'tq-engineer' });
    expect(closed.closedAt).not.toBeNull();
    // The answer and its author survive the close: a closed TQ still says what was decided and by whom.
    expect(closed).toMatchObject({ response: 'Reroute riser WEST of grid C.', respondedBy: 'tq-manager' });
  });

  it('refuses to rewrite a decision the raiser has already acted on', async () => {
    const refused = await manager.put(`/api/v1/engineering/technical-queries/${tqId}/respond`)
      .send({ response: 'Changed my mind again.', supersededReason: 'because' }).expect(409);
    expect(refused.body.message).toMatch(/closed; its answer can only be changed by reopening it first/);
  });

  it('refuses to close one twice', async () => {
    await engineer.put(`/api/v1/engineering/technical-queries/${tqId}/close`).expect(409);
  });

  it('refuses to close a query nobody has answered', async () => {
    // Closed with no response, a TQ was abandoned rather than resolved — a different fact, and one
    // worth not disguising as a resolution.
    const fresh = (await engineer.post('/api/v1/engineering/technical-queries').send({
      projectId, code: 'TQ-002', title: 'Unanswered', query: 'Still waiting.',
    }).expect(201)).body as Tq;
    const refused = await engineer.put(`/api/v1/engineering/technical-queries/${fresh.id}/close`).expect(409);
    expect(refused.body.message).toMatch(/nothing to accept/);
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).get(`/api/v1/engineering/technical-queries/${tqId}`).expect(401);
  });
});
