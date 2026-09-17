// FX-01 remediation — the four monetary consumers refusing an ungoverned rate, over HTTP.
//
// THE CASE THAT FOUND THE DEFECT, run as a negative proof: JPY 1,000,000 with no governed JPY:AED.
// Before this, that booked exchangeRate 3.6725 and baseValue 3,672,500 — a 24,000 AED liability
// recorded as 3.67 million. It must now be refused, and refused ATOMICALLY: no invoice, no base
// value, no outbox event implying a booking happened, no journal.
//
// WHAT THIS PROVES: the HTTP contract, the refusal taxonomy and the atomicity of the refusal.
// WHAT IT DOES NOT PROVE: persistence — this suite runs on in-memory stores by construction. The
// PostgreSQL behaviour of the governed store is proved by fx-governed-rate.pg.test.ts.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, EVENT_STORE, type EventStore, ExchangeRateService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `fxbook-${Date.now()}`;
const ACTOR = 'fxbook-finance';
// Approving is a SECOND person's act — segregation of duties refuses a self-approval, and this spec
// respects that rather than working around it.
const APPROVER = 'fxbook-approver';

describe('booking an invoice needs a governed rate (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let events: EventStore;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    // The domain refusals are plain Errors; without the filter they surface as 500 and this spec
    // would be asserting against a taxonomy that is not running.
    app.useGlobalFilters(new AllExceptionsFilter());

    const access = app.get(AccessService);
    for (const userId of [ACTOR, APPROVER]) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
      app.get(UsersService).save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    const tenant = app.get(TenantContext);
    app.use((req: unknown, _res: unknown, next: () => void) =>
      tenant.run({
        tenantId: TENANT, companyId: null,
        actorId: (req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? ACTOR,
        correlationId: 'e2e-fxbook',
      }, () => next()));

    await app.init();
    http = request(app.getHttpServer());
    events = app.get<EventStore>(EVENT_STORE);

    // EUR is governed from 1 June. USD and JPY are not governed at all.
    await app.get(ExchangeRateService).setRate(TENANT, 'EUR', 'AED', 4.05, new Date('2026-06-01'));
  });

  afterAll(async () => { await app?.close(); });

  const financeEvents = async (): Promise<Array<{ type: string }>> =>
    (await events.list({ tenantId: TENANT, limit: 500 })) as Array<{ type: string }>;

  // ── AP ────────────────────────────────────────────────────────────────────
  describe('AP — a supplier invoice', () => {
    it('REFUSES the JPY 1,000,000 case that found the defect, and leaves nothing behind', async () => {
      const before = (await financeEvents()).length;

      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'Tokyo ELV KK', supplierName: 'Tokyo ELV KK', value: 1_000_000, currency: 'JPY' });

      // Refused at the BOUNDARY: AURA cannot govern a JPY rate at all, so it never reaches the domain.
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('JPY');

      // Nothing persisted, and no event claiming a booking.
      const list = await http.get('/api/v1/finance/invoices').expect(200);
      expect(list.body.find((i: { currency?: string }) => i.currency === 'JPY')).toBeUndefined();
      expect((await financeEvents()).length).toBe(before);
    });

    it('REFUSES a governable currency with no rate registered, naming the pair and the date', async () => {
      const before = (await financeEvents()).length;

      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'US supplier', value: 10_000, currency: 'USD', invoiceDate: '2026-06-10' });

      // `must be registered` places this as a 400 — the request cannot be honoured as given.
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/USD/);
      // The date is shown the way a person reads it, not as an ISO string.
      expect(JSON.stringify(res.body)).toMatch(/10 Jun 2026/);

      expect((await http.get('/api/v1/finance/invoices')).body
        .find((i: { currency?: string }) => i.currency === 'USD')).toBeUndefined();
      expect((await financeEvents()).length).toBe(before);
    });

    it('REFUSES an invoice dated BEFORE the rate that governs it took effect', async () => {
      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'Early EUR', value: 1_000, currency: 'EUR', invoiceDate: '2026-05-01' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('1 May 2026');
    });

    it('books when a rate governs the invoice date, recording WHICH rate did it', async () => {
      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'EUR supplier', value: 1_000, currency: 'EUR', invoiceDate: '2026-06-10' })
        .expect(201);

      expect(res.body).toMatchObject({
        currency: 'EUR', exchangeRate: 4.05, baseValue: 4050,
        invoiceDate: '2026-06-10', exchangeRateEffectiveDate: '2026-06-01', exchangeRateSource: 'registered',
      });
    });

    it('books a BASE-CURRENCY invoice as the identity, needing no governed rate at all', async () => {
      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'Local supplier', value: 5_000, currency: 'AED' })
        .expect(201);
      expect(res.body).toMatchObject({ currency: 'AED', exchangeRate: 1, baseValue: 5000, exchangeRateSource: 'identity' });
      // The identity is not a rate: there is nothing to cite, and it says so rather than inventing one.
      expect(res.body.exchangeRateEffectiveDate).toBeNull();
      expect(res.body.exchangeRateId).toBeNull();
    });

    it('leaves an explicitly supplied rate alone, and records no governed provenance for it', async () => {
      const res = await http.post('/api/v1/finance/invoices')
        .send({ title: 'Asserted rate', value: 1_000, currency: 'EUR', exchangeRate: 3.9 })
        .expect(201);
      expect(res.body).toMatchObject({ exchangeRate: 3.9, baseValue: 3900 });
      // AURA did not govern this number, so it does not claim to have.
      expect(res.body.exchangeRateSource).toBeNull();
    });
  });

  // ── AR ────────────────────────────────────────────────────────────────────
  describe('AR — a customer invoice', () => {
    const line = [{ description: 'CCTV', quantity: 1, unitPrice: 1_000_000, vatRate: 0 }];

    it('REFUSES the same JPY case, and leaves no invoice behind', async () => {
      const res = await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber: `AR-JPY-${Date.now()}`, customerName: 'Tokyo Holdings',
        issueDate: '2026-06-10', lines: line, currency: 'JPY',
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('JPY');

      const list = await http.get('/api/v1/finance/customer-invoices').expect(200);
      expect(list.body.find((i: { currency?: string }) => i.currency === 'JPY')).toBeUndefined();
    });

    it('REFUSES a governable currency with no rate at the ISSUE date', async () => {
      const number = `AR-USD-${Date.now()}`;
      const res = await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber: number, customerName: 'US Client', issueDate: '2026-06-10', lines: line, currency: 'USD',
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/USD/);

      // And the invoice NUMBER is still free — the refusal consumed nothing, not even the identifier.
      const retry = await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber: number, customerName: 'US Client', issueDate: '2026-06-10', lines: line, currency: 'AED',
      });
      expect(retry.status).toBe(201);
    });

    it('books at the rate governing the ISSUE date, with provenance', async () => {
      const res = await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber: `AR-EUR-${Date.now()}`, customerName: 'EU Client',
        issueDate: '2026-06-10', lines: [{ description: 'CCTV', quantity: 1, unitPrice: 1000, vatRate: 0 }],
        currency: 'EUR',
      }).expect(201);

      expect(res.body).toMatchObject({
        currency: 'EUR', exchangeRate: 4.05, baseTotal: 4050,
        exchangeRateEffectiveDate: '2026-06-01', exchangeRateSource: 'registered',
      });
    });
  });

  // ── REVALUATION ───────────────────────────────────────────────────────────
  describe('revaluation', () => {
    it('reports unmeasurable exposure as unresolved and REFUSES to post a partial figure', async () => {
      // An open EUR liability, booked at the governed June rate.
      const inv = await http.post('/api/v1/finance/invoices')
        .send({ title: 'Open EUR', value: 1_000, currency: 'EUR', invoiceDate: '2026-06-10' }).expect(201);
      await http.patch(`/api/v1/finance/invoices/${inv.body.id}/status`)
        .set('x-e2e-actor', APPROVER).send({ status: 'approved' }).expect(200);

      // As of a date BEFORE any EUR rate exists, the exposure cannot be measured.
      const read = await http.get('/api/v1/finance/invoices/fx-revaluation').query({ asOf: '2026-05-01' }).expect(200);
      expect(read.body.complete).toBe(false);
      expect(read.body.unresolved.length).toBeGreaterThan(0);
      expect(read.body.unresolved[0]).toMatchObject({ currency: 'EUR', reason: 'no_governed_rate' });

      const posted = await http.post('/api/v1/finance/invoices/fx-revaluation/post').send({ asOf: '2026-05-01' });
      expect(posted.status).toBe(400);
      expect(JSON.stringify(posted.body)).toContain('incomplete');
    });
  });
});
