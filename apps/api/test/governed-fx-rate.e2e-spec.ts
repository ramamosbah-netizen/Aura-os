// FX-01's strict path over HTTP — the FX authority answering "I do not know" instead of a number.
//
// WHAT THIS PROVES: the HTTP contract, the permission that governs it, and that the union survives
// serialisation — a caller over the wire can tell a governed rate from an unknown one, and can tell
// WHICH kind of unknown it hit.
//
// WHAT IT DOES NOT PROVE: persistence. This suite runs on in-memory stores by construction
// (vitest.config.e2e.ts sets DATABASE_URL: ''), so the rate resolved here comes from the service's
// own tenant-scoped registry, not from aura_exchange_rates. Reading a governed rate out of
// PostgreSQL is browser-suite work and is NOT claimed here.
//
// It runs AUTH-ON. The permission guard does nothing behind a context shim — a spec that injects an
// actor directly is not being refused anything, it is simply not being asked.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, ExchangeRateService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `fx-tenant-${Date.now()}`;

describe('the governed FX rate (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let finance: ReturnType<typeof request.agent>;
  let buyer: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    // Before the container is built: AuthService reads the secret in a field initialiser.
    process.env.AUTH_JWT_SECRET = 'governed-fx-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    // The conversion refusal is a plain domain Error; without the filter it surfaces as 500 and the
    // taxonomy this spec asserts would not be running at all.
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // Two REAL shipped roles, unmodified. Finance owns the rate register (`finance.*`); the Buyer
    // holds procurement and read-only inventory/projects/subcontracts, and no finance permission
    // at all. That asymmetry is the shipped catalogue's, not this spec's.
    access.grant({ userId: 'fx-finance', roleId: 'r-finance', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'fx-buyer', roleId: 'r-procurement', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    for (const userId of ['fx-finance', 'fx-buyer']) users.save({ tenantId: TENANT, userId, displayName: userId, active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    finance = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'fx-finance', tenantId: TENANT })}`);
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'fx-buyer', tenantId: TENANT })}`);

    // ONE governed rate, effective on a known date. Nothing else is registered.
    await app.get(ExchangeRateService).setRate(TENANT, 'USD', 'AED', 3.6701, new Date('2026-09-01'));
  });

  afterAll(async () => { await app?.close(); });

  const governed = (from: string, to: string, asOf?: string) =>
    finance.get('/api/v1/finance/fx/governed-rate').query({ from, to, ...(asOf ? { asOf } : {}) });

  it('answers a registered pair with the rate, its effective date and where it came from', async () => {
    const res = await governed('USD', 'AED', '2026-09-17').expect(200);
    expect(res.body).toMatchObject({
      status: 'governed', rate: 3.6701, from: 'USD', to: 'AED',
      // `registered`, not `stored`: this suite has no database, so the rate came from the service's
      // own in-process registry. The source names that difference rather than hiding it.
      effectiveDate: '2026-09-01', asOf: '2026-09-17', source: 'registered', rateId: null,
    });
  });

  it('says UNKNOWN for a currency it cannot govern, and carries no rate at all', async () => {
    const res = await governed('JPY', 'AED').expect(200);
    expect(res.body).toMatchObject({ status: 'unknown', reason: 'unsupported_currency' });
    expect(res.body.detail).toContain('JPY');
    expect(res.body.rate).toBeUndefined();
  });

  it('says UNKNOWN for a governable pair nobody registered', async () => {
    const res = await governed('EUR', 'AED').expect(200);
    expect(res.body).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });

  /**
   * `GET convert` used to answer this with 4.003025, crossed from a hardcoded EUR:USD 1.09 that
   * nobody in this tenant had approved. FX-02 moved it onto the governed resolver, so the two
   * surfaces can no longer disagree: the read says unknown and the conversion refuses.
   */
  it('converts only at a governed rate, and refuses rather than inventing one', async () => {
    const refused = await finance.get('/api/v1/finance/fx/convert')
      .query({ amount: 1_000_000, from: 'EUR', to: 'AED' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('No governed EUR/AED exchange rate');

    // A currency AURA cannot govern is refused too, where it used to convert at the USD peg.
    const jpy = await finance.get('/api/v1/finance/fx/convert')
      .query({ amount: 1_000_000, from: 'JPY', to: 'AED' });
    expect(jpy.status).toBe(400);
    expect(JSON.stringify(jpy.body)).toContain('JPY');

    // A governed pair converts, and the answer says WHICH rate did it.
    const ok = await finance.get('/api/v1/finance/fx/convert')
      .query({ amount: 1_000, from: 'USD', to: 'AED', asOf: '2026-09-17' }).expect(200);
    expect(ok.body).toMatchObject({
      amount: 1_000, from: 'USD', to: 'AED', rate: 3.6701, converted: 3670.1,
      effectiveDate: '2026-09-01', source: 'registered', asOf: '2026-09-17',
    });

    // …and it will not reach back before that rate took effect.
    const early = await finance.get('/api/v1/finance/fx/convert')
      .query({ amount: 1_000, from: 'USD', to: 'AED', asOf: '2026-08-15' });
    expect(early.status).toBe(400);
  });

  it('will not answer with a rate that had not taken effect on the date asked about', async () => {
    const res = await governed('USD', 'AED', '2026-08-15').expect(200);
    expect(res.body).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });

  it('values a currency in itself at 1 without needing anybody to register it', async () => {
    const res = await governed('AED', 'AED').expect(200);
    expect(res.body).toMatchObject({ status: 'governed', rate: 1, source: 'identity', effectiveDate: null });
  });

  it('reads a lowercase code, because a caller hands over a raw string', async () => {
    const res = await governed(' usd ', 'aed', '2026-09-17').expect(200);
    expect(res.body).toMatchObject({ status: 'governed', from: 'USD', to: 'AED' });
  });

  it('refuses a request that names no currencies, or a date that is not one', async () => {
    await finance.get('/api/v1/finance/fx/governed-rate').query({ from: 'USD' }).expect(400);
    await finance.get('/api/v1/finance/fx/governed-rate').query({ from: 'USD', to: 'AED', asOf: 'whenever' }).expect(400);
  });

  it('is governed by finance.fx.read — a Buyer is refused it, and refused unauthenticated', async () => {
    await buyer.get('/api/v1/finance/fx/governed-rate').query({ from: 'USD', to: 'AED' }).expect(403);
    // …while the Buyer can reach their own surface, so this is a permission boundary and not a
    // broken token.
    await buyer.get('/api/v1/procurement/rfqs').expect(200);
    await request(app.getHttpServer()).get('/api/v1/finance/fx/governed-rate').query({ from: 'USD', to: 'AED' }).expect(401);
  });
});
