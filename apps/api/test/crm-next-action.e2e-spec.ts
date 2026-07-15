// AURA OS — Next-Action Invariant e2e (HTTP). Every ACTIVE opportunity must
// carry a Next Action + Due Date + Owner; a missing/past-due step surfaces as
// "Needs Attention". Won/lost deals are terminal and never flagged.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import { opportunityAttention, type Opportunity } from '@aura/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe('Next-Action Invariant e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'na-tenant', companyId: null, actorId: null, correlationId: 'e2e-na' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = async (id: string): Promise<Opportunity> =>
    (await http.get(`/api/v1/crm/opportunities/${id}`).expect(200)).body;

  it('a bare active opportunity needs attention on all three fronts', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'Bare deal', value: 100_000 }).expect(201)
    ).body as Opportunity;

    const att = opportunityAttention(await get(opp.id));
    expect(att.active).toBe(true);
    expect(att.needsAttention).toBe(true);
    expect(att.gaps.sort()).toEqual(['no-due-date', 'no-next-action', 'no-owner']);
  });

  it('setting Next Action + Owner + future Due Date clears it', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'Healthy deal' }).expect(201)
    ).body as Opportunity;

    await http
      .patch(`/api/v1/crm/opportunities/${opp.id}`)
      .send({ nextAction: 'Send revised BOQ', ownerId: 'user-42', nextActionDueDate: isoDate(7) })
      .expect(200);

    const att = opportunityAttention(await get(opp.id));
    expect(att.needsAttention).toBe(false);
    expect(att.gaps).toEqual([]);
  });

  it('a past-due next action flags as overdue', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'Slipping deal' }).expect(201)
    ).body as Opportunity;

    await http
      .patch(`/api/v1/crm/opportunities/${opp.id}`)
      .send({ nextAction: 'Chase PO', ownerId: 'user-7', nextActionDueDate: isoDate(-3) })
      .expect(200);

    const att = opportunityAttention(await get(opp.id));
    expect(att.gaps).toContain('overdue');
    expect(att.needsAttention).toBe(true);
  });

  it('won & lost deals are terminal — never flagged even when bare', async () => {
    const opp = (
      // G5: a win must carry a final value (a win of 0 is not a win). 'Bare' here means bare of
      // a NEXT ACTION — which is what this test is about — not bare of commercial facts.
      await http.post('/api/v1/crm/opportunities').send({ title: 'Closed deal', value: 250_000 }).expect(201)
    ).body as Opportunity;

    // G5: the win gate needs the winning context; the deal is still 'bare' of a NEXT ACTION,
    // which is what this test is actually about.
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`).send({ stage: 'won', winReason: 'Incumbent advantage' }).expect(200);
    const won = opportunityAttention(await get(opp.id));
    expect(won.active).toBe(false);
    expect(won.needsAttention).toBe(false);
  });
});
