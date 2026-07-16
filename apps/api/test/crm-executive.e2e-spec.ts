// AURA OS — C6 Executive CRM (§7 exec), e2e (HTTP).
//
// Wins and losses recorded through the real stage gates, read back as intelligence: why we won,
// why we lost, who beat us, and how much of the book is one client. The column G5 made mandatory
// finally gets read.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C6 executive CRM (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c6-tenant', companyId: null, actorId: null, correlationId: 'e2e-c6' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const exec = async (days?: number) =>
    (await http.get(`/api/v1/crm/executive${days ? `?days=${days}` : ''}`).expect(200)).body;

  it('reads win/loss reasons, competitors and concentration off real decided deals', async () => {
    const emaar = (await http.post('/api/v1/crm/accounts').send({ name: 'Emaar' }).expect(201)).body;
    const damac = (await http.post('/api/v1/crm/accounts').send({ name: 'Damac' }).expect(201)).body;

    const openDeal = async (title: string, accountId: string, value: number) =>
      (await http.post('/api/v1/crm/opportunities')
        .send({ title, accountId, value, stage: 'proposal' })
        .expect(201)).body;

    const big = await openDeal('Emaar CCTV', emaar.id, 800_000);
    const small = await openDeal('Damac ACS', damac.id, 200_000);
    const lostDeal = await openDeal('Damac BMS', damac.id, 500_000);

    // The real gates: a win must carry winReason (G5), a loss its lossReason.
    await http.patch(`/api/v1/crm/opportunities/${big.id}`)
      .send({ stage: 'won', winReason: 'incumbent' }).expect(200);
    await http.patch(`/api/v1/crm/opportunities/${small.id}`)
      .send({ stage: 'won', winReason: 'incumbent' }).expect(200);
    await http.patch(`/api/v1/crm/opportunities/${lostDeal.id}`)
      .send({ stage: 'lost', lossReason: 'price', competitors: 'RivalCo, SmallFry' }).expect(200);

    const r = await exec();

    expect(r.decided).toMatchObject({ won: 2, lost: 1, wonValue: 1_000_000, lostValue: 500_000 });
    expect(r.decided.winRate).toBe(67);
    expect(r.decided.valueWinRate).toBe(67);

    // The column G5 made mandatory, finally read.
    expect(r.winReasons).toEqual([{ reason: 'incumbent', deals: 2, value: 1_000_000, percent: 100 }]);
    expect(r.lossReasons[0]).toMatchObject({ reason: 'price', deals: 1, value: 500_000 });
    expect(r.competitors.map((c: { name: string }) => c.name).sort()).toEqual(['RivalCo', 'SmallFry']);

    // Concentration is a property of the whole book.
    expect(r.concentration.top[0]).toMatchObject({ accountName: 'Emaar', wonValue: 800_000, percent: 80 });
    expect(r.concentration.topAccountPercent).toBe(80);
    expect(r.concentration.accounts).toBe(2);
    expect(r.coverage).toMatchObject({ winsWithoutReason: 0, lossesWithoutReason: 0 });
  });

  it('echoes the window it used, and a junk one falls back rather than becoming all-time', async () => {
    expect((await exec(90)).period.days).toBe(90);
    expect((await exec()).period.days).toBe(365);
    const junk = (await http.get('/api/v1/crm/executive?days=banana').expect(200)).body;
    expect(junk.period.days).toBe(365);
    // Absurd windows clamp instead of quietly answering a different question.
    const huge = (await http.get('/api/v1/crm/executive?days=999999').expect(200)).body;
    expect(huge.period.days).toBe(3650);
  });

  // The "nothing decided ⇒ null win rate" path is covered deterministically by the unit tests:
  // every deal here is decided today, so no window this suite can ask for excludes them.
});
