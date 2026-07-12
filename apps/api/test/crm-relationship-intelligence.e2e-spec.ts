// AURA OS — Relationship Intelligence e2e (HTTP). A bare open deal raises
// multiple ranked signals; fixing the underlying data clears them.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

interface Alert { id: string; kind: string; severity: string; entityId: string; }
interface Payload { counts: Record<string, number>; alerts: Alert[]; }

describe('Relationship Intelligence e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'ri-tenant', companyId: null, actorId: null, correlationId: 'e2e-ri' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const alertsFor = async (entityId: string): Promise<Alert[]> => {
    const body = (await http.get('/api/v1/crm/intelligence/alerts').expect(200)).body as Payload;
    return body.alerts.filter((a) => a.entityId === entityId);
  };

  it('a bare open deal raises no-next-action, stalled and no-decision-maker', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Quiet Corp' }).expect(201)).body;
    const opp = (
      await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Silent deal', value: 200_000, accountId: account.id, accountName: account.name })
        .expect(201)
    ).body;

    const kinds = (await alertsFor(opp.id)).map((a) => a.kind);
    expect(kinds).toContain('no-next-action');
    expect(kinds).toContain('stalled-opportunity');
    expect(kinds).toContain('no-decision-maker');
  });

  it('fixing the data clears the signals', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Healthy Corp' }).expect(201)).body;
    const opp = (
      await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Managed deal', value: 300_000, accountId: account.id, accountName: account.name })
        .expect(201)
    ).body;

    // Next step + owner + future due date → clears no-next-action.
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
      .send({ nextAction: 'Present proposal', ownerId: 'u-1', nextActionDueDate: future }).expect(200);
    // A decision-maker on the account → clears no-decision-maker.
    await http.post('/api/v1/crm/contacts')
      .send({ name: 'Dana Chief', accountId: account.id, stakeholderRole: 'decision_maker' }).expect(201);
    // A logged activity → clears stalled-opportunity.
    await http.post('/api/v1/crm/activities')
      .send({ type: 'call', subject: 'Intro call', relatedType: 'opportunity', relatedId: opp.id }).expect(201);

    const kinds = (await alertsFor(opp.id)).map((a) => a.kind);
    expect(kinds).not.toContain('no-next-action');
    expect(kinds).not.toContain('stalled-opportunity');
    expect(kinds).not.toContain('no-decision-maker');
  });

  it('an overdue customer invoice raises an overdue-ar alert linked to its account', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Debtor Corp' }).expect(201)).body;
    const past = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    const inv = (
      await http.post('/api/v1/finance/customer-invoices')
        .send({
          invoiceNumber: 'INV-RI-1', customerName: 'Debtor Corp', issueDate: past, dueDate: past,
          lines: [{ description: 'Services', quantity: 1, unitPrice: 5000, vatRate: 5 }],
        })
        .expect(201)
    ).body;
    await http.post(`/api/v1/finance/customer-invoices/${inv.id}/issue`).expect(201);

    const ar = (await alertsFor(account.id)).find((a) => a.kind === 'overdue-ar');
    expect(ar).toBeDefined();
    expect(ar!.entity).toBe('account');
    expect(ar!.reason).toMatch(/overdue/);
  });
});
