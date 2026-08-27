// AURA OS — ADR-0020 qualification-at-award, end-to-end over real HTTP routes.
//
// The unit and Postgres suites prove the service and the database. This proves the thing neither
// can: that the whole chain is actually WIRED — an evidence-bearing qualification written through
// the public route, a governed award taken through the product's own award command, and a snapshot
// read back off the 360 payload the UI consumes.
//
// It also carries the two negative controls that keep the claim honest:
//   · a legacy win (no award provenance) reads NOT_CAPTURED, never today's record as history;
//   · the qualification writer is AUTHORIZED — an actor without a grant is refused.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = 'qaa-tenant';
const SALES = 'u-qaa-sales';       // granted r-sales → holds crm.opportunity.*
const OUTSIDER = 'u-qaa-outsider'; // granted nothing

interface Q360 {
  qualification: {
    score: number;
    provenance: 'AT_AWARD' | 'NOT_CAPTURED' | 'CURRENT';
    view: { confirmed: number; total: number };
    atAward: null | {
      snapshot: { version: number; awardSource: string; capturedAt: string; dimensions: Record<string, { status: string; evidence: string | null }> };
      view: { confirmed: number; total: number };
    };
  };
  lifecycle: { state: string; awardDocumented: boolean };
}

describe('ADR-0020 qualification-at-award (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());

    // The qualification writer is authorized, so the actor is REAL and needs a real grant. Kept
    // per-request via a header so the rest of the chain (tender lifecycle) is unaffected — the same
    // idiom the tender specs use.
    const access = app.get(AccessService);
    access.seedStandardRoles();
    access.grant({ userId: SALES, roleId: 'r-sales', scope: { kind: 'org', level: 'tenant', id: TENANT } });

    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run(
        {
          tenantId: TENANT,
          companyId: null,
          actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null,
          correlationId: 'e2e-qaa',
        },
        () => next(),
      ),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const newOpp = async (over: Record<string, unknown> = {}) =>
    (await http.post('/api/v1/crm/opportunities').send({ title: 'Qualification chain', value: 500_000, ...over }).expect(201)).body;

  /** The evidence-bearing writer, through the public route, as a granted user. */
  const writeQualification = (id: string, body: Record<string, unknown>, actor = SALES) =>
    http.patch(`/api/v1/crm/opportunities/${id}/qualification`).set('x-e2e-actor', actor).send(body);

  const read360 = async (id: string): Promise<Q360> =>
    (await http.get(`/api/v1/crm/opportunities/${id}/summary`).expect(200)).body as Q360;

  /** Walk a tender through its governed gates and award it with real customer evidence (ADR-0021). */
  const awardTender = async (tenderId: string) => {
    await http.patch(`/api/v1/tendering/tenders/${tenderId}/status`).send({ status: 'qualifying' }).expect(200);
    await http.post('/api/v1/tendering/bid-scores').send({ tenderId, criteria: [{ name: 'fit', weight: 1, score: 8 }] }).expect(201);
    await http.patch(`/api/v1/tendering/tenders/${tenderId}/status`).send({ status: 'estimating' }).expect(200);
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tenderId}/boq`).expect(200)).body;
    const item = (await http.post(`/api/v1/tendering/tenders/${tenderId}/boq/items`)
      .send({ boqId: boq.id, itemCode: '01', description: 'Cameras', unit: 'no', quantity: 10, rate: 50_000 }).expect(201)).body;
    await http.post('/api/v1/tendering/estimates')
      .send({ boqItemId: item.id, components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 1200 }], applyToBoq: false }).expect(201);
    await http.patch(`/api/v1/tendering/tenders/${tenderId}/status`).send({ status: 'priced' }).expect(200);
    await http.patch(`/api/v1/tendering/tenders/${tenderId}/status`).send({ status: 'submitted' }).expect(200);
    return (await http.post(`/api/v1/tendering/tenders/${tenderId}/award`).set('x-e2e-actor', SALES)
      .send({ awardedValue: 1_000_000, currency: 'AED', awardedAt: '2026-08-21T07:30:00.000Z', awardReference: 'LOA-QAA' }).expect(201)).body;
  };

  it('THE CHAIN: qualification write → governed tender award → snapshot readable on the 360', async () => {
    const opp = await newOpp({ title: 'Airport CCTV', executionType: 'tender' });

    // 1. Record what we actually know, WITH evidence — the thing four booleans could never carry.
    await writeQualification(opp.id, {
      budget: { status: 'CONFIRMED', evidence: 'Client budget letter BL-88', source: 'document' },
      need: { status: 'CONFIRMED', evidence: 'Scope signed off 12 Aug', source: 'meeting' },
      authority: { status: 'CONCERN', evidence: 'signatory still unclear' },
    }).expect(200);

    const beforeAward = await read360(opp.id);
    expect(beforeAward.qualification.provenance).toBe('CURRENT'); // open deal: no history yet
    expect(beforeAward.qualification.atAward).toBeNull();
    expect(beforeAward.qualification.view.confirmed).toBe(2);

    // 2. A REAL governed award, through the product's own command (not a stage edit).
    const tender = (await http.post(`/api/v1/crm/opportunities/${opp.id}/start-tender`).expect(201)).body;
    const won = await awardTender(tender.id);
    expect(won.status).toBe('won');

    // 3. The deal is governed-won and the snapshot is on the payload the UI reads.
    const afterAward = await read360(opp.id);
    expect(afterAward.lifecycle.awardDocumented).toBe(true);
    expect(afterAward.qualification.provenance).toBe('AT_AWARD');
    const snap = afterAward.qualification.atAward!;
    expect(snap.snapshot.version).toBe(1);
    expect(snap.snapshot.awardSource).toBe('tender_award');
    expect(snap.view.confirmed).toBe(2);
    // The evidence travelled — this is what makes it a record rather than a number.
    expect(snap.snapshot.dimensions.budget.evidence).toBe('Client budget letter BL-88');
    expect(snap.snapshot.dimensions.authority.status).toBe('CONCERN');
    // Captured at the CUSTOMER's award date, not the bus's now().
    expect(snap.snapshot.capturedAt).toBe('2026-08-21T07:30:00.000Z');

    // 4. THE INCIDENT, over HTTP: retract everything after the close. History must not move.
    await writeQualification(opp.id, {
      budget: { status: 'UNKNOWN' }, need: { status: 'UNKNOWN' }, authority: { status: 'UNKNOWN' },
    }).expect(200);

    const afterEdit = await read360(opp.id);
    expect(afterEdit.qualification.view.confirmed).toBe(0);          // the live record moved…
    expect(afterEdit.qualification.atAward!.view.confirmed).toBe(2); // …history did not
    expect(afterEdit.qualification.atAward!.snapshot.dimensions.budget.evidence).toBe('Client budget letter BL-88');
    expect(afterEdit.qualification.provenance).toBe('AT_AWARD');
  });

  it('NEGATIVE CONTROL: a legacy win reads NOT_CAPTURED — never the current record as history', async () => {
    const opp = await newOpp({ title: 'Legacy close', executionType: 'direct_sale' });
    await writeQualification(opp.id, { need: { status: 'CONFIRMED', evidence: 'verbal' } }).expect(200);

    // The ungoverned path: a plain stage edit. It stamps no award provenance, so it must capture
    // nothing — `stage = 'won'` is not, and must never become, the trigger.
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
      .send({ stage: 'won', winReason: 'verbal go-ahead' }).expect(200);

    const after = await read360(opp.id);
    expect(after.lifecycle.state).toBe('LEGACY_WON');
    expect(after.lifecycle.awardDocumented).toBe(false);
    expect(after.qualification.provenance).toBe('NOT_CAPTURED');
    expect(after.qualification.atAward).toBeNull();
    // The current record is still readable — it is simply not dressed up as a historical figure.
    expect(after.qualification.view.confirmed).toBe(1);
  });

  it('AUTHORIZATION: the qualification writer refuses an actor with no grant', async () => {
    const opp = await newOpp({ title: 'Guarded' });
    // What this route writes is what an award freezes permanently, so authentication alone was
    // never a sufficient answer to who may set it.
    const refused = await writeQualification(opp.id, { budget: { status: 'BLOCKER' } }, OUTSIDER);
    expect(refused.status).toBe(403);

    // …and the refusal wrote nothing.
    const after = await read360(opp.id);
    expect(after.qualification.view.confirmed).toBe(0);
    expect(after.qualification.score).toBe(0);
  });

  it('rejects an unknown status instead of merging it', async () => {
    const opp = await newOpp({ title: 'Validated' });
    await writeQualification(opp.id, { budget: { status: 'PROBABLY' } }).expect(400);
    await writeQualification(opp.id, {}).expect(400); // no dimension supplied
  });
});
