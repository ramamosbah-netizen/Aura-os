import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * F-09 — A MAIL CARRIES A GOVERNED DOCUMENT, Auth ON, the shipped catalogue, in-memory stores
 * (contract proof; the screens and PostgreSQL are proved in apps/web/e2e/mail-document-attachments.spec.ts).
 *
 *   attach      the sender must be able to DOWNLOAD the document; the revision is pinned
 *   no grant    the mail gives nobody access: a recipient who could not open it blocks the send,
 *               by name, until the DMS — through a share the sender may make — says they can
 *   delivery    sent through the internal provider, the recipient opens the pinned revision
 *   denial      off the envelope → 404; on it but with the share revoked → 403; a recipient named
 *               on a draft has been sent nothing
 */
it('F-09: attach an authorised DMS document, send it, the recipient downloads it, and nobody else can', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-mail-attachments-secret';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const access = app.get(AccessService);
  const users = app.get(UsersService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    const T = `mail-att-${Date.now()}`;
    const seat = (userId: string, roleId: string) => {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: T } });
      users.save({ tenantId: T, userId, displayName: userId, active: true });
    };
    seat('m-doccon', 'r-document-controller');
    seat('m-qs', 'r-commercial-manager');
    seat('m-sales', 'r-sales');
    seat('m-pm', 'r-pm');
    const as = (userId: string) => request.agent(app.getHttpServer()).set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: T })}`);
    const doccon = as('m-doccon');
    const qs = as('m-qs');
    const sales = as('m-sales');
    const pm = as('m-pm');

    // The Document Controller's own document — owner: VIEW, DOWNLOAD, EDIT, SHARE.
    const doc = (await doccon.post('/api/v1/documents').send({
      kind: 'report', title: 'Riser schedule', aggregateType: 'project', aggregateId: '00000000-0000-4000-8000-0000000000aa',
      content: 'riser revision one', fileName: 'riser.txt', contentType: 'text/plain',
    }).expect(201)).body as { document: { id: string } };
    const documentId = doc.document.id;
    // A second revision: the attachment must pin THIS one, and keep serving it after a third.
    await doccon.post(`/api/v1/documents/${documentId}/versions`).send({ content: 'riser revision two', fileName: 'riser.txt', contentType: 'text/plain' }).expect(201);

    // ── Compose to the QS, by user ─────────────────────────────────────────────────────────────
    const draft = (await doccon.post('/api/v1/comms/mailbox/drafts').send({
      to: [{ role: 'to', address: null, userId: 'm-qs' }], subject: 'Riser for pricing', body: 'Attached.',
    }).expect(201)).body as { id: string };
    // Named on it, the QS has been sent nothing yet: not readable, not editable, not sendable.
    await qs.get(`/api/v1/comms/mailbox/message/${draft.id}/thread`).expect(404);
    await qs.patch(`/api/v1/comms/mailbox/drafts/${draft.id}`).send({ subject: 'hijacked' }).expect(404);
    await qs.post(`/api/v1/comms/mailbox/message/${draft.id}/send`).send({}).expect(404);

    // Nobody attaches a document they cannot see; it answers as if it were not there.
    await sales.post('/api/v1/comms/mailbox/drafts').send({ to: ['x@example.com'], subject: 's' }).expect(201)
      .then(async ({ body }) => sales.post(`/api/v1/comms/mailbox/drafts/${(body as { id: string }).id}/attachments`).send({ documentId }).expect(404));

    const attached = (await doccon.post(`/api/v1/comms/mailbox/drafts/${draft.id}/attachments`).send({ documentId }).expect(201)).body as {
      attachments: Array<{ id: string; documentId: string; version: number; name: string }>;
    };
    expect(attached.attachments).toEqual([expect.objectContaining({ documentId, version: 2, name: 'riser.txt' })]);
    const attachmentId = attached.attachments[0].id;
    await doccon.post(`/api/v1/comms/mailbox/drafts/${draft.id}/attachments`).send({ documentId }).expect(409);

    // ── The mail grants nothing: the QS cannot open it, so it does not go ──────────────────────
    const before = (await doccon.get(`/api/v1/comms/mailbox/message/${draft.id}/attachment-access`).expect(200)).body as Array<{
      cannotOpen: Array<{ userId: string | null; why: string }>; senderMayShare: boolean;
    }>;
    expect(before).toEqual([expect.objectContaining({ senderMayShare: true, cannotOpen: [{ userId: 'm-qs', address: null, why: 'no-access' }] })]);
    const refused = await doccon.post(`/api/v1/comms/mailbox/message/${draft.id}/send`).send({}).expect(409);
    expect(JSON.stringify(refused.body)).toContain('m-qs cannot open \\"riser.txt\\"');

    // The sender gives access in the DMS — their own act, under the DMS's own rules.
    const share = (await doccon.post(`/api/v1/documents/${documentId}/share`).send({ subjectType: 'USER', subjectId: 'm-qs', permission: 'DOWNLOAD' }).expect(201)).body as { id: string };
    expect(((await doccon.get(`/api/v1/comms/mailbox/message/${draft.id}/attachment-access`).expect(200)).body as Array<{ cannotOpen: unknown[] }>)[0].cannotOpen).toEqual([]);
    // Attachments are fixed once a message has left.
    await doccon.post(`/api/v1/comms/mailbox/message/${draft.id}/send`).send({}).expect(201);
    await doccon.delete(`/api/v1/comms/mailbox/drafts/${draft.id}/attachments/${attachmentId}`).expect(400);

    // A later revision does not change what was sent.
    await doccon.post(`/api/v1/documents/${documentId}/versions`).send({ content: 'riser revision three', fileName: 'riser.txt', contentType: 'text/plain' }).expect(201);

    // ── Received, and opened by the person it reached ───────────────────────────────────────────
    const inbox = (await qs.get('/api/v1/comms/mailbox/folder/inbox').expect(200)).body as Array<{ id: string; attachments: Array<{ id: string }> }>;
    expect(inbox.find((m) => m.id === draft.id)?.attachments.map((a) => a.id)).toEqual([attachmentId]);
    const file = await qs.get(`/api/v1/comms/mailbox/message/${draft.id}/attachments/${attachmentId}/content`)
      .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); })
      .expect(200);
    expect((file.body as Buffer).toString('utf8')).toBe('riser revision two');
    expect(file.headers['content-disposition']).toContain('attachment');

    // ── Denied ───────────────────────────────────────────────────────────────────────────────────
    // Off the envelope: the message is not there for them, whatever they could do in the DMS.
    await sales.get(`/api/v1/comms/mailbox/message/${draft.id}/attachments/${attachmentId}/content`).expect(404);
    // On the envelope, but the DMS no longer lets them: being sent a document is not owning it.
    await doccon.delete(`/api/v1/documents/${documentId}/permissions/${share.id}`).expect(200);
    await qs.get(`/api/v1/comms/mailbox/message/${draft.id}/attachments/${attachmentId}/content`).expect(403);

    // ── A sender who may download but not share is told so, and offered no grant ──────────────
    await doccon.post(`/api/v1/documents/${documentId}/share`).send({ subjectType: 'USER', subjectId: 'm-pm', permission: 'DOWNLOAD' }).expect(201);
    const pmDraft = (await pm.post('/api/v1/comms/mailbox/drafts').send({ to: [{ role: 'to', address: null, userId: 'm-qs' }], subject: 'fwd' }).expect(201)).body as { id: string };
    await pm.post(`/api/v1/comms/mailbox/drafts/${pmDraft.id}/attachments`).send({ documentId }).expect(201);
    expect(((await pm.get(`/api/v1/comms/mailbox/message/${pmDraft.id}/attachment-access`).expect(200)).body as Array<{ senderMayShare: boolean }>)[0].senderMayShare).toBe(false);
    await pm.post(`/api/v1/comms/mailbox/message/${pmDraft.id}/send`).send({}).expect(409);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
  }
});
