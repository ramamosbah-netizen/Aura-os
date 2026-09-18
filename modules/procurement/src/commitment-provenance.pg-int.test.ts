import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresFrameworkAgreementStore } from './postgres-framework-agreement-store';
import { PostgresRfqStore } from './postgres-rfq-store';
import { activateAgreement, makeFrameworkAgreement, terminateAgreement } from './domain/framework-agreement';
import { makeRfq, sendRfq } from './domain/rfq';
import { newId } from '@aura/shared';

/**
 * PROCUREMENT COMMITMENTS — REAL Postgres proof that the signatures persist and the invariants
 * belong to the database.
 *
 * Both framework transitions wrote `actorId: null` and the row held nothing, because `activate(id)`
 * and `terminate(id)` took no actor. `sent_by` did not exist on an RFQ either. A service-level fix
 * alone would be a promise; the constraints are what make it a fact.
 *
 * The stores' shared column lists gained four and two names respectively, and the RFQ UPDATE gained
 * two placeholders. A positional mismatch there fails every write at runtime while the whole
 * in-memory suite stays green, which is the second reason this file exists.
 *
 * Gated on PROCUREMENT_PG_TEST_URL (migration 0367 applied).
 */
const URL = process.env.PROCUREMENT_PG_TEST_URL;
const TENANT = `proc-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('procurement commitments — activation and send provenance in Postgres', () => {
  let pool: Pool;
  let agreements: PostgresFrameworkAgreementStore;
  let rfqs: PostgresRfqStore;
  let n = 0;
  // `supplier_id` is a real uuid column, so the fixture uses one. Unlike the actor columns, which
  // are text everywhere except the one place that made variation approval impossible (0365).
  const supplierId = newId();

  const rawAgreement = async (id: string) => {
    const res = await pool.query<{ status: string; created_by: string | null; activated_by: string | null; activated_at: Date | null; terminated_by: string | null; terminated_at: Date | null }>(
      'SELECT status, created_by, activated_by, activated_at, terminated_by, terminated_at FROM public.aura_procurement_framework_agreements WHERE id = $1', [id]);
    return res.rows[0];
  };
  const draftAgreement = async (createdBy: string | null = 'u-e2e-buyer') => {
    const fa = makeFrameworkAgreement({
      tenantId: TENANT, title: `Cable rate card ${++n}`, supplierId,
      validFrom: '2026-01-01', validTo: '2026-12-31', ceilingValue: 1_000_000, createdBy,
    });
    await agreements.save(fa);
    return fa;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    agreements = new PostgresFrameworkAgreementStore(pool);
    rfqs = new PostgresRfqStore(pool);
  });

  afterAll(async () => {
    for (const t of ['aura_procurement_framework_agreements', 'aura_procurement_rfqs']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end();
  });

  it('writes who committed the business to the ceiling, and who ended it', async () => {
    const fa = await draftAgreement();
    expect(await rawAgreement(fa.id)).toMatchObject({ status: 'draft', created_by: 'u-e2e-buyer', activated_by: null });

    await agreements.save(activateAgreement((await agreements.get(fa.id))!, 'u-e2e-procmgr'));
    const active = await rawAgreement(fa.id);
    expect(active).toMatchObject({ status: 'active', created_by: 'u-e2e-buyer', activated_by: 'u-e2e-procmgr' });
    expect(active.activated_at, 'the activated event carried a null actor and the row held nothing').not.toBeNull();

    await agreements.save(terminateAgreement((await agreements.get(fa.id))!, 'u-e2e-procmgr'));
    const ended = await rawAgreement(fa.id);
    expect(ended).toMatchObject({ status: 'terminated', activated_by: 'u-e2e-procmgr', terminated_by: 'u-e2e-procmgr' });
    expect(ended.terminated_at).not.toBeNull();

    const read = await agreements.get(fa.id);
    expect(read).toMatchObject({ activatedBy: 'u-e2e-procmgr', terminatedBy: 'u-e2e-procmgr' });
  });

  it('INVARIANT — an activation cannot be half-signed', async () => {
    const fa = await draftAgreement();
    for (const [sql, label] of [
      [`UPDATE public.aura_procurement_framework_agreements SET activated_at = now() WHERE id = $1`, 'time, no signer'],
      [`UPDATE public.aura_procurement_framework_agreements SET activated_by = 'u-x' WHERE id = $1`, 'signer, no time'],
    ] as const) {
      await expect(pool.query(sql, [fa.id]), label).rejects.toThrow(/aura_framework_activated_complete/);
    }
  });

  it('INVARIANT — a termination cannot be half-signed either', async () => {
    const fa = await draftAgreement();
    await expect(pool.query(
      `UPDATE public.aura_procurement_framework_agreements SET terminated_by = 'u-x' WHERE id = $1`, [fa.id],
    )).rejects.toThrow(/aura_framework_terminated_complete/);
  });

  it('INVARIANT — nothing is terminated that was never put in force', async () => {
    const fa = await draftAgreement();
    await expect(pool.query(
      `UPDATE public.aura_procurement_framework_agreements SET status = 'terminated', terminated_by = 'u-x', terminated_at = now() WHERE id = $1`,
      [fa.id],
    )).rejects.toThrow(/aura_framework_terminated_after_active/);
  });

  it('never lets a later write restate who negotiated it', async () => {
    // `created_by` stays out of the DO UPDATE SET. If activating could rewrite it, the creator could
    // become "somebody else" and activate their own agreement — the refusal would never fire.
    const fa = await draftAgreement('u-e2e-buyer');
    await agreements.save({ ...fa, createdBy: 'u-impostor', title: 'edited' });
    expect((await rawAgreement(fa.id)).created_by).toBe('u-e2e-buyer');
  });

  it('records who sent the enquiry', async () => {
    const rfq = makeRfq({ tenantId: TENANT, title: 'Cables', createdBy: 'u-e2e-buyer' });
    await rfqs.create(rfq);
    await rfqs.update(sendRfq((await rfqs.get(rfq.id))!, 'u-e2e-buyer'));

    const res = await pool.query<{ status: string; sent_by: string | null; sent_at: Date | null }>(
      'SELECT status, sent_by, sent_at FROM public.aura_procurement_rfqs WHERE id = $1', [rfq.id]);
    expect(res.rows[0]).toMatchObject({ status: 'sent', sent_by: 'u-e2e-buyer' });
    expect(res.rows[0].sent_at).not.toBeNull();

    await expect(pool.query(
      `UPDATE public.aura_procurement_rfqs SET sent_by = NULL WHERE id = $1`, [rfq.id],
    )).rejects.toThrow(/aura_rfq_sent_complete/);
  });
});
