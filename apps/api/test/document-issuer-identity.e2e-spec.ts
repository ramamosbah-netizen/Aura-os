import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * F-01 — TWO COMPANIES, TWO LETTERHEADS. Auth ON, the shipped catalogue, in-memory stores.
 *
 * A record carries the company of the session that wrote it. Sessions minted here carry a
 * `companyId` claim — the claim an identity provider sets; password sign-in does not yet carry one
 * (recorded as COMPANY-CTX-01) — so two companies' tax invoices exist side by side, and each must
 * print its own legal identity, never the other's and never the tenant profile's in its place.
 */
it('F-01: each company\'s invoice prints that company\'s governed identity', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-issuer-identity-secret';
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
    const T = `issuer-${Date.now()}`;
    const seat = (userId: string, roleId: string) => {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: T } });
      users.save({ tenantId: T, userId, displayName: userId, active: true });
    };
    seat('id-admin', 'r-admin');
    seat('id-fin-a', 'r-finance');
    seat('id-fin-b', 'r-finance');
    seat('id-sales', 'r-sales');
    const as = (userId: string, companyId: string | null = null) => request.agent(app.getHttpServer())
      .set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: T, companyId })}`);
    const admin = as('id-admin');

    // The organisation profile — the group's own identity.
    for (const [key, value] of Object.entries({
      'company.legalName': 'Group Holding L.L.C.', 'company.trn': '100111111111111', 'company.address': 'Group Tower, Dubai',
    })) await admin.post('/api/v1/admin/settings').send({ key, value }).expect(201);

    // Two companies: Alpha records its full identity, Beta only its name and TRN.
    await admin.post('/api/v1/admin/companies').send({
      id: 'alpha', name: 'Alpha ELV', trn: '100333333333333', legalName: 'Alpha ELV Systems L.L.C.',
      address: 'Office 1, Abu Dhabi', phone: '+971 2 111 1111', email: 'accounts@alpha.example',
    }).expect(201);
    await admin.post('/api/v1/admin/companies').send({ id: 'beta', name: 'Beta MEP', trn: '100444444444444' }).expect(201);
    // An edit that does not send the identity keeps it: changing a code must not erase a letterhead.
    const edited = (await admin.post('/api/v1/admin/companies').send({ id: 'alpha', name: 'Alpha ELV', code: 'ALP' }).expect(201)).body as Record<string, string>;
    expect(edited).toMatchObject({ code: 'ALP', trn: '100333333333333', legalName: 'Alpha ELV Systems L.L.C.', address: 'Office 1, Abu Dhabi' });

    // ── One tax invoice from each company ───────────────────────────────────────────────────────
    const invoice = async (userId: string, companyId: string, number: string) => (await as(userId, companyId).post('/api/v1/finance/customer-invoices').send({
      invoiceNumber: number, customerName: 'Marina Developments', issueDate: '2026-10-01', dueDate: '2026-10-31',
      lines: [{ description: 'Progress claim', quantity: 1, unitPrice: 1000, vatRate: 5 }],
    }).expect(201)).body as { id: string; companyId: string | null };
    const a = await invoice('id-fin-a', 'alpha', `A-${Date.now()}`);
    const b = await invoice('id-fin-b', 'beta', `B-${Date.now()}`);
    expect([a.companyId, b.companyId]).toEqual(['alpha', 'beta']);

    // What each prints — asked by someone else entirely: the letterhead is not a secret.
    const reader = as('id-sales');
    const identityOf = async (companyId: string | null) => (await reader.get(`/api/v1/documents/issuer-identity${companyId ? `?companyId=${companyId}` : ''}`).expect(200)).body as Record<string, unknown>;
    expect(await identityOf(a.companyId)).toMatchObject({
      configured: true, name: 'Alpha ELV', legalName: 'Alpha ELV Systems L.L.C.', trn: '100333333333333',
      address: 'Office 1, Abu Dhabi', phone: '+971 2 111 1111', email: 'accounts@alpha.example',
    });
    const beta = await identityOf(b.companyId);
    // Beta recorded no legal name or address: blank on its paper — not Alpha's, not the group's.
    expect(beta).toMatchObject({ configured: true, name: 'Beta MEP', legalName: 'Beta MEP', trn: '100444444444444', address: '', email: '' });
    expect(JSON.stringify(beta)).not.toMatch(/Alpha|Group/);
    // A document no company issued is the group's; a company nobody registered is nobody's.
    expect(await identityOf(null)).toMatchObject({ name: 'Group Holding L.L.C.', trn: '100111111111111', address: 'Group Tower, Dubai' });
    expect(await identityOf('gamma')).toMatchObject({ configured: false, name: 'Company identity not configured', trn: '' });

    // Only an administrator maintains a company's identity.
    await as('id-fin-a', 'alpha').post('/api/v1/admin/companies').send({ id: 'alpha', name: 'Alpha ELV', legalName: 'Hijacked LLC' }).expect(403);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
  }
});
