import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { newId } from '@aura/shared';
import { PostgresSubcontractStore } from './postgres-subcontract-store';
import { makeClaim, certifyClaim, payClaim } from './domain/claim';
import { makeSubcontractVariation, approveVariation, rejectVariation } from './domain/variation';
import { makeSubcontract } from './domain/subcontract';

/**
 * SUBCONTRACTOR CERTIFICATION — REAL Postgres proof that the signatures persist and the invariants
 * belong to the database.
 *
 * The API e2e for this runs on in-memory stores, so it proves the HTTP contract and the permissions
 * and nothing about the schema. That gap is not theoretical: `CLAIM_COLS` here is shared between the
 * SELECT and the INSERT, three names went into it, and the UPDATE statement gained two placeholders
 * whose parameters had to be added by hand — a mismatch there makes every claim write fail at runtime
 * while the whole in-memory suite stays green.
 *
 * Gated on SUBCONTRACTS_PG_TEST_URL (migration 0364 applied).
 */
const URL = process.env.SUBCONTRACTS_PG_TEST_URL;
const TENANT = `sub-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('subcontractor claims — certification provenance in Postgres', () => {
  let pool: Pool;
  let store: PostgresSubcontractStore;
  const projectId = newId();

  const rawClaim = async (id: string) => {
    const res = await pool.query<{ status: string; created_by: string | null; certified_by: string | null; certified_at: Date | null; paid_by: string | null; paid_at: Date | null }>(
      'SELECT status, created_by, certified_by, certified_at, paid_by, paid_at FROM public.aura_subcontracts_claims WHERE id = $1', [id]);
    return res.rows[0];
  };
  const newSub = async (value: number) => {
    const s = makeSubcontract({ tenantId: TENANT, projectId, title: `Containment ${value}`, subcontractorName: 'Gulf Electromech LLC', value, retentionPercentage: 10 });
    await store.createSubcontract({ ...s, status: 'active' });
    return { ...s, status: 'active' as const };
  };
  const newClaim = async (subcontractId: string, work: number, raisedBy: string | null) => {
    const c = makeClaim({ tenantId: TENANT, subcontractId, claimNumber: 1, workCompletedValue: work, previouslyCertifiedValue: 0, createdBy: raisedBy }, 10);
    await store.createClaim(c);
    return c;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresSubcontractStore(pool);
  });

  afterAll(async () => {
    for (const t of ['aura_subcontracts_claims', 'aura_subcontracts_variations', 'aura_subcontracts']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end();
  });

  it('writes the whole chain of signatures and reads them back', async () => {
    // The INSERT and the UPDATE are the assertion. A name added to the shared column list without its
    // placeholder throws at runtime and no in-memory test can see it.
    const sub = await newSub(500_000);
    const claim = await newClaim(sub.id, 100_000, 'u-e2e-pm');
    expect(await rawClaim(claim.id)).toMatchObject({ status: 'draft', created_by: 'u-e2e-pm', certified_by: null, paid_by: null });

    await store.updateClaim(certifyClaim((await store.getClaim(claim.id))!, 'u-e2e-qs', sub.value));
    expect(await rawClaim(claim.id)).toMatchObject({ status: 'certified', created_by: 'u-e2e-pm', certified_by: 'u-e2e-qs', paid_by: null });

    await store.updateClaim(payClaim((await store.getClaim(claim.id))!, 'u-e2e-finance'));
    const paid = await rawClaim(claim.id);
    expect(paid).toMatchObject({ status: 'paid', created_by: 'u-e2e-pm', certified_by: 'u-e2e-qs', paid_by: 'u-e2e-finance' });
    expect(paid.paid_at, 'who released the money, and when — the row recorded neither before').not.toBeNull();

    const read = await store.getClaim(claim.id);
    expect(read).toMatchObject({ createdBy: 'u-e2e-pm', certifiedBy: 'u-e2e-qs', paidBy: 'u-e2e-finance' });
    expect(read?.paidAt).not.toBeNull();
  });

  it('never lets a later write restate who raised the claim', async () => {
    // `created_by` is written on INSERT and left out of the UPDATE on purpose. If certifying could
    // rewrite it, the raiser could become "somebody else" and certify their own application — the
    // refusal would still be in the code and would simply never fire.
    const sub = await newSub(500_000);
    const claim = await newClaim(sub.id, 50_000, 'u-e2e-pm');
    await store.updateClaim({ ...claim, createdBy: 'u-impostor', status: 'certified', certifiedAt: new Date().toISOString(), certifiedBy: 'u-e2e-qs' });

    const row = await rawClaim(claim.id);
    expect(row.created_by).toBe('u-e2e-pm');
    expect(row.certified_by).toBe('u-e2e-qs'); // the certification landed; the authorship did not
  });

  it('INVARIANT — a certificate cannot be half-signed', async () => {
    const sub = await newSub(500_000);
    const claim = await newClaim(sub.id, 50_000, 'u-e2e-pm');
    for (const [sql, label] of [
      [`UPDATE public.aura_subcontracts_claims SET certified_at = now() WHERE id = $1`, 'time, no signer'],
      [`UPDATE public.aura_subcontracts_claims SET certified_by = 'u-x' WHERE id = $1`, 'signer, no time'],
    ] as const) {
      await expect(pool.query(sql, [claim.id]), label).rejects.toThrow(/aura_subcontract_claim_certified_complete/);
    }
  });

  it('INVARIANT — a payment cannot be half-signed either', async () => {
    const sub = await newSub(500_000);
    const claim = await newClaim(sub.id, 50_000, 'u-e2e-pm');
    for (const [sql, label] of [
      [`UPDATE public.aura_subcontracts_claims SET paid_at = now() WHERE id = $1`, 'time, no payer'],
      [`UPDATE public.aura_subcontracts_claims SET paid_by = 'u-x' WHERE id = $1`, 'payer, no time'],
    ] as const) {
      await expect(pool.query(sql, [claim.id]), label).rejects.toThrow(/aura_subcontract_claim_paid_complete/);
    }
  });

  it('INVARIANT — nothing is paid that was never certified', async () => {
    // Money leaving against a certificate nobody issued. The service already refused it; this is the
    // database refusing it too, which is what makes it an invariant rather than a code path.
    const sub = await newSub(500_000);
    const claim = await newClaim(sub.id, 50_000, 'u-e2e-pm');
    await expect(pool.query(
      `UPDATE public.aura_subcontracts_claims SET status = 'paid', paid_by = 'u-x', paid_at = now() WHERE id = $1`, [claim.id],
    )).rejects.toThrow(/aura_subcontract_claim_paid_after_certified/);
  });

  it('records who DECIDED a variation, either way — a rejection used to be anonymous', async () => {
    const sub = await newSub(500_000);
    const approved = makeSubcontractVariation({ tenantId: TENANT, subcontractId: sub.id, reference: `VO-A-${Date.now()}`, type: 'addition', amount: 10_000, createdBy: 'u-e2e-pm' });
    const rejected = makeSubcontractVariation({ tenantId: TENANT, subcontractId: sub.id, reference: `VO-R-${Date.now()}`, type: 'omission', amount: 5_000, createdBy: 'u-e2e-pm' });
    await store.createVariation(approved);
    await store.createVariation(rejected);

    await store.updateVariation(approveVariation(approved, 'u-e2e-qs'));
    await store.updateVariation(rejectVariation(rejected, 'u-e2e-qs'));

    const rows = await pool.query<{ status: string; created_by: string | null; decided_by: string | null; decided_at: Date | null }>(
      'SELECT status, created_by, decided_by, decided_at FROM public.aura_subcontracts_variations WHERE tenant_id = $1 ORDER BY status', [TENANT]);
    const byStatus = Object.fromEntries(rows.rows.map((r) => [r.status, r]));
    expect(byStatus.approved).toMatchObject({ created_by: 'u-e2e-pm', decided_by: 'u-e2e-qs' });
    expect(byStatus.rejected).toMatchObject({ created_by: 'u-e2e-pm', decided_by: 'u-e2e-qs' });
    expect(byStatus.rejected.decided_at, 'a rejection is a decision somebody made, and it was undated').not.toBeNull();
  });
});
