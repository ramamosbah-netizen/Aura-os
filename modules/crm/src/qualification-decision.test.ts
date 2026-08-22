import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type EventStore, type TenantContext } from '@aura/core';
import { makeLead, assessLeadQualification, LEAD_QUALIFICATION_DIMENSIONS, type LeadQualificationDimensions } from '@aura/shared';
import { InMemoryLeadStore } from './in-memory-lead-store';
import { InMemoryQualificationDecisionStore } from './in-memory-qualification-decision-store';
import { LeadService } from './lead.service';

/**
 * Qualification Decision (audit) — deterministic in-memory proofs.
 *
 * These cover what a single-threaded, no-DB harness can HONESTLY prove: that a qualify transition
 * records exactly one immutable snapshot, that a later reassessment changes the current verdict but
 * NOT the historical snapshot, that a repeat of an already-qualified state is not a new decision, and
 * that the history read is tenant-scoped. Production CONCURRENCY (two rivals ⇒ one decision) and
 * ROLLBACK (snapshot failure ⇒ lead not qualified) are Postgres properties — SELECT … FOR UPDATE +
 * one BEGIN/COMMIT — and are exercised separately by qualification-decision.pg-int.test.ts.
 */
function harness() {
  let boundTenant = 't1';
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const leadStore = new InMemoryLeadStore();
  const decisions = new InMemoryQualificationDecisionStore();
  const tenant = {
    boundTenantId: () => boundTenant,
    boundCompanyId: () => null,
  } as unknown as TenantContext;
  const leads = new LeadService(leadStore, decisions, events, new NullTxRunner(), access, tenant);
  return { leads, leadStore, decisions, events, setTenant: (t: string) => { boundTenant = t; } };
}

/** Rate exactly the first `n` dimensions at `value` — a controllable coverage/score. */
function dims(n: number, value: number): LeadQualificationDimensions {
  const out: LeadQualificationDimensions = {};
  for (const key of LEAD_QUALIFICATION_DIMENSIONS.slice(0, n)) out[key] = value;
  return out;
}

describe('qualify transition records an immutable decision', () => {
  it('qualifying → qualified writes exactly one decision, snapshotting the evidence at that moment', async () => {
    const { leads, leadStore, decisions } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Jane', companyName: 'Globex', status: 'qualifying' });
    await leadStore.create(lead);
    // Thin evidence at decision time: 2 of 8 dimensions rated.
    await leads.assess(lead.id, { dimensions: dims(2, 30) }, 'user-1');
    const atDecision = assessLeadQualification(dims(2, 30));

    const updated = await leads.update(lead.id, { status: 'qualified' }, 'user-1');
    expect(updated.status).toBe('qualified');

    const history = await leads.qualificationDecisions(lead.id);
    expect(history).toHaveLength(1);
    const d = history[0];
    expect(d.fromStatus).toBe('qualifying');
    expect(d.toStatus).toBe('qualified');
    expect(d.qualifiedBy).toBe('user-1');            // the real actor, server-stamped
    expect(typeof d.qualifiedAt).toBe('string');
    // Self-contained evidence snapshot: raw dimensions AND the derived assessment.
    expect(d.evidenceSnapshot.dimensions).toEqual(dims(2, 30));
    expect(d.evidenceSnapshot.assessment.coverage).toEqual(atDecision.coverage);
    expect(d.evidenceSnapshot.assessment.recommendation).toBe(atDecision.recommendation);
    expect(d.evidenceSnapshot.assessment.score).toBe(atDecision.score);
    expect(Array.isArray(d.evidenceSnapshot.assessment.strengths)).toBe(true);
    expect(Array.isArray(d.evidenceSnapshot.assessment.gaps)).toBe(true);
    // The decision store is append-only — no update/delete surface exists on it.
    expect('update' in decisions).toBe(false);
  });

  it('THE IMMUTABILITY PROOF: a later reassessment changes the current verdict, not the snapshot', async () => {
    const { leads, leadStore } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Ravi', companyName: 'Initech', status: 'qualifying' });
    await leadStore.create(lead);

    // 1–3. Decide on thin evidence, then freeze it.
    await leads.assess(lead.id, { dimensions: dims(2, 30) }, 'user-1');
    await leads.update(lead.id, { status: 'qualified' }, 'user-1');
    const before = (await leads.qualificationDecisions(lead.id))[0].evidenceSnapshot;

    // 4–6. The evidence moves on: re-rate all 8 dimensions high. Current assessment changes.
    await leads.assess(lead.id, { dimensions: dims(8, 90) }, 'user-2');
    const current = assessLeadQualification(dims(8, 90));
    expect(current.coverage.rated).toBe(8);
    expect(current.score).toBeGreaterThan(before.assessment.score);

    // 7. The historical snapshot MUST be untouched — this is the whole point of the record.
    const after = (await leads.qualificationDecisions(lead.id))[0].evidenceSnapshot;
    expect(after.assessment.score).toBe(before.assessment.score);
    expect(after.assessment.coverage.rated).toBe(2);
    expect(after.dimensions).toEqual(dims(2, 30));
    // And still exactly one decision — a reassessment is not a decision.
    expect(await leads.qualificationDecisions(lead.id)).toHaveLength(1);
  });

  it('qualified → qualified is NOT a new decision (idempotent lifecycle)', async () => {
    const { leads, leadStore } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Sam', companyName: 'Umbrella', status: 'qualifying' });
    await leadStore.create(lead);
    await leads.update(lead.id, { status: 'qualified' }, 'user-1');
    await leads.update(lead.id, { status: 'qualified' }, 'user-1'); // repeat
    expect(await leads.qualificationDecisions(lead.id)).toHaveLength(1);
  });

  it('history is tenant-scoped: another tenant cannot read a lead’s decisions', async () => {
    const { leads, leadStore, setTenant } = harness();
    const lead = makeLead({ tenantId: 't1', name: 'Nia', companyName: 'Hooli', status: 'qualifying' });
    await leadStore.create(lead);
    await leads.update(lead.id, { status: 'qualified' }, 'user-1');
    expect(await leads.qualificationDecisions(lead.id)).toHaveLength(1);

    setTenant('t2'); // a different tenant now asks
    expect(await leads.qualificationDecisions(lead.id)).toEqual([]);
  });
});
