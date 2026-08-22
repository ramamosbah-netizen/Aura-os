import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, PostgresEventStore, TenantContext, type AccessService } from '@aura/core';
import { makeLead } from '@aura/shared';
import { PostgresLeadStore } from './postgres-lead-store';
import { PostgresQualificationDecisionStore } from './postgres-qualification-decision-store';
import { QUALIFICATION_DECISION_EVENT } from './domain/qualification-decision';
import type { QualificationDecisionStore } from './qualification-decision-store';
import { LeadService } from './lead.service';

/**
 * Qualification Decision — REAL Postgres integration proofs.
 *
 * The in-memory suite cannot prove concurrency or rollback: NullTxRunner does not roll back and JS is
 * single-threaded. These two invariants are properties of Postgres — SELECT … FOR UPDATE serialises
 * rival transactions, and one BEGIN/COMMIT rolls the lead flip back if the snapshot append fails — so
 * they are proven here against a live database.
 *
 * Gated on CRM_PG_TEST_URL (skipped otherwise). The target DB must already have the CRM migrations
 * applied (aura_crm_leads, aura_events, and 0242 aura_crm_lead_qualification_decisions). The pool
 * binds the tenant GUC on every connection so the FORCE-RLS policies are satisfied uniformly.
 *
 *   CRM_PG_TEST_URL=postgres://user:pass@host:5432/db pnpm --filter @aura/crm test qualification-decision.pg-int
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `qual-int-${Date.now()}`;

const run = URL ? describe : describe.skip;

run('qualification decision — Postgres concurrency + rollback', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let txRunner: PostgresTxRunner;
  let events: PostgresEventStore;
  let leadStore: PostgresLeadStore;
  let decisions: PostgresQualificationDecisionStore;
  const access = { assert: () => undefined } as unknown as AccessService;

  const info = { tenantId: TENANT, companyId: null, actorId: null, correlationId: null };
  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(info, fn);

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    // Bind the RLS GUC on EVERY pooled connection so non-tx store reads and the tx runner alike see
    // only this tenant's rows. The tx runner re-affirms it transaction-locally — harmless.
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    tenant = new TenantContext();
    txRunner = new PostgresTxRunner(pool, tenant);
    events = new PostgresEventStore(pool, tenant);
    leadStore = new PostgresLeadStore(pool);
    decisions = new PostgresQualificationDecisionStore(pool);
  });

  afterAll(async () => {
    // Best-effort cleanup of this run's rows (append-only table forbids DELETE via trigger, so the
    // decisions rows are intentionally left; tests use a unique tenant id per run to stay isolated).
    await pool?.query('DELETE FROM public.aura_crm_leads WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_events WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  async function seedQualifyingLead(name: string) {
    const lead = makeLead({ tenantId: TENANT, name, companyName: `${name} Co`, status: 'qualifying' });
    await withTenant(() => txRunner.run((tx) => leadStore.createWithClient(tx, lead)));
    return lead;
  }

  it('D — two concurrent qualify requests ⇒ lead qualified, exactly ONE decision + ONE event', async () => {
    const svc = new LeadService(leadStore, decisions, events, txRunner, access, tenant);
    const lead = await seedQualifyingLead('Concurrent');

    // Two rivals racing the same transition. FOR UPDATE serialises them; the loser sees the
    // already-qualified row and records nothing.
    await withTenant(() => Promise.allSettled([
      svc.update(lead.id, { status: 'qualified' }),
      svc.update(lead.id, { status: 'qualified' }),
    ]));

    const stored = await withTenant(() => leadStore.get(lead.id));
    expect(stored?.status).toBe('qualified');

    const history = await withTenant(() => decisions.listForLead(TENANT, lead.id));
    expect(history).toHaveLength(1);

    const evs = await withTenant(() => events.list({ tenantId: TENANT, aggregateId: lead.id, type: QUALIFICATION_DECISION_EVENT.recorded }));
    expect(evs).toHaveLength(1);
  });

  it('C — a snapshot append failure rolls the whole transaction back: lead NOT qualified, 0 decisions', async () => {
    const faulty: QualificationDecisionStore = {
      append: async () => { throw new Error('boom'); },
      appendWithClient: async () => { throw new Error('boom'); },
      get: async () => null,
      listForLead: async () => [],
    };
    const svc = new LeadService(leadStore, faulty, events, txRunner, access, tenant);
    const lead = await seedQualifyingLead('Rollback');

    await expect(withTenant(() => svc.update(lead.id, { status: 'qualified' }))).rejects.toThrow(/boom/);

    // The lead flip happened in the SAME transaction as the failed append, so it rolled back too.
    const stored = await withTenant(() => leadStore.get(lead.id));
    expect(stored?.status).toBe('qualifying');
    const history = await withTenant(() => decisions.listForLead(TENANT, lead.id));
    expect(history).toHaveLength(0);
  });
});
