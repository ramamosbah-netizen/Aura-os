// AURA OS — G1 Universal Activity + G2 Next Action projection, e2e (HTTP).
//
// G1: Activity is ONE work system for the whole deal chain — it must attach to a tender, contract
// and project, not only to CRM records, or "My Work across the deal chain" is unbuildable.
//
// G2: Activity is the SINGLE source of truth for what happens next. The Lead half of the CRM
// always projected its next action from the activity stream; the Opportunity half kept a second,
// hand-maintained truth. These tests pin the behaviour that closes that asymmetry: COMPLETING an
// activity moves the visible next action — for a Lead AND for an Opportunity — with no column edit.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const isoDate = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

interface Opp360 {
  nextAction: { subject: string | null; dueDate: string | null; ownerId: string | null; fromActivity: boolean };
  attention: { active: boolean; gaps: string[]; needsAttention: boolean };
}

describe('G1 universal activity + G2 next-action projection (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      // actorId null mirrors the sibling CRM specs: no actor ⇒ no permission gate, so these tests
      // exercise the projection rule rather than the access-control layer (covered elsewhere).
      tenant.run({ tenantId: 'ua-tenant', companyId: null, actorId: null, correlationId: 'e2e-ua' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newActivity = async (body: Record<string, unknown>): Promise<{ id: string }> =>
    (await http.post('/api/v1/crm/activities').send(body).expect(201)).body;

  const complete = async (id: string): Promise<void> => {
    await http.post(`/api/v1/crm/activities/${id}/complete`).send({ outcome: 'done' }).expect(201);
  };

  const opp360 = async (id: string): Promise<Opp360> =>
    (await http.get(`/api/v1/crm/opportunities/${id}/summary`).expect(200)).body as Opp360;

  // ── G1 ────────────────────────────────────────────────────────────────────────────────────────
  it('G1: an activity attaches to every step of the deal chain, not just CRM', async () => {
    // The whole point: the same work system spans the chain. Ids are polymorphic references
    // (type + id, no join), so these need not exist as rows for the reference to be legal.
    for (const relatedType of ['account', 'contact', 'lead', 'opportunity', 'quotation', 'tender', 'contract', 'project']) {
      const a = await newActivity({
        type: 'task', subject: `work on a ${relatedType}`, relatedType,
        relatedId: '11111111-1111-4111-8111-111111111111', dueDate: isoDate(3),
      });
      expect(a.id).toBeTruthy();
    }
  });

  it('G1: the related-type union is enforced at the edge (a typo cannot persist)', async () => {
    await http.post('/api/v1/crm/activities')
      .send({ type: 'task', subject: 'typo', relatedType: 'oportunity', relatedId: 'x' })
      .expect(400);
  });

  it('G1: activities are listable by the new deal-chain types', async () => {
    const tenderId = '22222222-2222-4222-8222-222222222222';
    await newActivity({ type: 'meeting', subject: 'Tender clarification meeting', relatedType: 'tender', relatedId: tenderId, dueDate: isoDate(1) });
    const rows = (await http.get(`/api/v1/crm/activities?relatedType=tender&relatedId=${tenderId}`).expect(200)).body as Array<{ subject: string }>;
    expect(rows.map((r) => r.subject)).toContain('Tender clarification meeting');
  });

  // ── G2 ────────────────────────────────────────────────────────────────────────────────────────
  it('G2: completing an activity moves the OPPORTUNITY next action — no column touched', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({
        title: 'G2 projection deal', value: 100_000, ownerId: 'u-tester',
      }).expect(201)
    ).body as { id: string; nextAction: string | null };

    // Nothing scheduled ⇒ the invariant is unmet and there is no next action to show.
    const bare = await opp360(opp.id);
    expect(bare.nextAction.subject).toBeNull();
    expect(bare.nextAction.fromActivity).toBe(false);
    expect(bare.attention.gaps).toContain('no-next-action');

    // Schedule two steps. The EARLIER one is what happens next.
    const first = await newActivity({
      type: 'call', subject: 'Discovery call', relatedType: 'opportunity', relatedId: opp.id,
      dueDate: isoDate(1), assigneeId: 'u-tester',
    });
    await newActivity({
      type: 'meeting', subject: 'Technical presentation', relatedType: 'opportunity', relatedId: opp.id,
      dueDate: isoDate(5), assigneeId: 'u-tester',
    });

    const scheduled = await opp360(opp.id);
    expect(scheduled.nextAction.subject).toBe('Discovery call');
    expect(scheduled.nextAction.dueDate).toBe(isoDate(1));
    expect(scheduled.nextAction.fromActivity).toBe(true);
    // The invariant is satisfied by the activity alone — the column was never written.
    expect(scheduled.attention.needsAttention).toBe(false);

    // THE POINT: complete it, and the next action becomes the following step automatically.
    await complete(first.id);
    const after = await opp360(opp.id);
    expect(after.nextAction.subject).toBe('Technical presentation');
    expect(after.nextAction.dueDate).toBe(isoDate(5));
    expect(after.attention.needsAttention).toBe(false);

    // And the stored column stayed null throughout — proving it is not the source of truth.
    const raw = (await http.get(`/api/v1/crm/opportunities/${opp.id}`).expect(200)).body as { nextAction: string | null };
    expect(raw.nextAction).toBeNull();
  });

  it('G2: completing the LAST activity re-opens the invariant (nothing happens next)', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({ title: 'G2 last step deal', value: 50_000, ownerId: 'u-tester' }).expect(201)
    ).body as { id: string };
    const only = await newActivity({
      type: 'call', subject: 'Only step', relatedType: 'opportunity', relatedId: opp.id, dueDate: isoDate(2), assigneeId: 'u-tester',
    });
    expect((await opp360(opp.id)).attention.needsAttention).toBe(false);

    await complete(only.id);
    const after = await opp360(opp.id);
    expect(after.nextAction.subject).toBeNull();
    expect(after.attention.gaps).toContain('no-next-action');
    expect(after.attention.needsAttention).toBe(true);
  });

  it('G2: the legacy column still works when no activity is scheduled (backward compatible)', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({
        title: 'G2 legacy deal', value: 25_000, ownerId: 'u-tester',
        nextAction: 'Legacy typed step', nextActionDueDate: isoDate(4),
      }).expect(201)
    ).body as { id: string };

    const legacy = await opp360(opp.id);
    expect(legacy.nextAction.subject).toBe('Legacy typed step');
    expect(legacy.nextAction.fromActivity).toBe(false);
    expect(legacy.attention.needsAttention).toBe(false);

    // An activity OVERRIDES the column — the column is a fallback, never a competing truth.
    await newActivity({
      type: 'call', subject: 'Real scheduled step', relatedType: 'opportunity', relatedId: opp.id,
      dueDate: isoDate(2), assigneeId: 'u-tester',
    });
    const projected = await opp360(opp.id);
    expect(projected.nextAction.subject).toBe('Real scheduled step');
    expect(projected.nextAction.fromActivity).toBe(true);
  });

  it('G2: completing an activity moves the LEAD next action too (same rule, both halves)', async () => {
    const lead = (
      await http.post('/api/v1/crm/leads').send({ name: 'Projection Lead', companyName: 'Projection Co', source: 'website' }).expect(201)
    ).body as { id: string };
    await http.patch(`/api/v1/crm/leads/${lead.id}`).send({ assignedTo: 'u-tester' }).expect(200);

    const first = await newActivity({
      type: 'call', subject: 'First lead call', relatedType: 'lead', relatedId: lead.id, dueDate: isoDate(1), assigneeId: 'u-tester',
    });
    await newActivity({
      type: 'meeting', subject: 'Site survey', relatedType: 'lead', relatedId: lead.id, dueDate: isoDate(6), assigneeId: 'u-tester',
    });

    const row = async (): Promise<{ nextActivityDueIso: string | null; attention: { gaps: string[] } }> => {
      const body = (await http.get('/api/v1/crm/leads/command').expect(200)).body as { leads: Array<{ id: string; nextActivityDueIso: string | null; attention: { gaps: string[] } }> };
      return body.leads.find((r) => r.id === lead.id)!;
    };

    expect((await row()).nextActivityDueIso).toBe(isoDate(1));
    expect((await row()).attention.gaps).not.toContain('NO_NEXT_ACTIVITY');

    await complete(first.id);
    // The lead's next follow-up is now the site survey — derived, exactly like the opportunity.
    expect((await row()).nextActivityDueIso).toBe(isoDate(6));
  });
});
