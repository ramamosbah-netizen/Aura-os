import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresTxRunner, PostgresEventStore, TenantContext, type AccessService } from '@aura/core';
import { newId } from '@aura/shared';
import { PostgresQuotationStore } from './postgres-quotation-store';
import { PostgresCommercialBaselineStore } from './postgres-commercial-baseline-store';
import { PostgresQuotationReviewStore } from './postgres-quotation-review-store';
import { QuotationService } from './quotation.service';

/**
 * EST-16 — REAL Postgres proof of migration 0392, through the stores the application uses (they
 * UPSERT, so every save also passes the BEFORE INSERT branch) and through raw SQL, which is what a
 * second writer that skips the domain would do. Gated on CRM_PG_TEST_URL (migrations to 0392).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `est16-int-${Date.now()}`;
const run = URL ? describe : describe.skip;
// Authority is proven Auth-ON in the browser suite; this proves what the DATABASE refuses.
const permissive = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;

const estimateAt = (supply: number) => ({
  lines: [{ description: '[C-01] IP camera (no)', quantity: 60, unit: 'no', sourceItemId: 'boq-1', unitPrice: supply }],
  estimation: [{ description: 'IP camera', quantity: 60, unit: 'no', sourceItemId: 'boq-1', supplyUnitPrice: supply * 0.6, profitPercent: 15 }] as never,
});

run('EST-16 — tender offer revisions in PostgreSQL (migration 0392)', () => {
  let pool: Pool;
  let tenant: TenantContext;
  let store: PostgresQuotationStore;
  let svc: QuotationService;
  const info = { tenantId: TENANT, companyId: null, actorId: null, correlationId: null };
  const as = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(info, fn);
  const offer = (tenderId: string, quoteNumber: string) => as(() => svc.create({
    tenantId: TENANT, quoteNumber, customerName: 'Emaar', accountId: null, sourceTenderId: tenderId,
    issueDate: '2026-09-25', ...estimateAt(500), createdBy: 'u-estimator',
  }));
  const refused = async (sql: string, params: unknown[], message: RegExp) => {
    const err = await pool.query(sql, params).then(() => null, (e: { code?: string; message: string }) => e);
    expect(err, `expected refusal: ${sql}`).not.toBeNull();
    expect(err!.code).toBe('23514');
    expect(err!.message).toMatch(message);
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    tenant = new TenantContext();
    store = new PostgresQuotationStore(pool);
    svc = new QuotationService(
      store, new PostgresCommercialBaselineStore(pool), new PostgresEventStore(pool, tenant), permissive, tenant,
      new PostgresTxRunner(pool, tenant), null, new PostgresQuotationReviewStore(pool), null,
    );
  });

  afterAll(async () => {
    // Review decisions are append-only by design and stay; the quotation rows are this tenant's own.
    for (const t of ['aura_crm_commercial_baselines', 'aura_crm_quotations', 'aura_events']) {
      await pool?.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool?.end();
  });

  it('returned → revised with a reason: both decisions persist, Rev 0 is frozen, Rev 1 carries the estimate', async () => {
    const tender = newId();
    const rev0 = await offer(tender, `QUO-A-${TENANT}`);
    await as(() => svc.changeStatus(rev0.id, 'submit_review', 'u-estimator'));
    await as(() => svc.changeStatus(rev0.id, 'return_for_revision', 'u-qs', 'Re-rate the cameras'));

    // The returned draft is SUBMITTED: its figures do not move in place, by the store or by SQL.
    const returned = (await as(() => svc.get(rev0.id)))!;
    await expect(as(() => store.save({ ...returned, total: 1 }))).rejects.toThrow(/submitted for review, so a change is its next revision/);
    await refused('UPDATE public.aura_crm_quotations SET total = 1 WHERE id = $1', [rev0.id], /submitted for review/);

    const rev1 = await as(() => svc.revise(rev0.id, 'u-estimator', { reason: 'Cameras re-rated as asked', regenerated: estimateAt(450) }));
    const decisions = await pool.query(
      'SELECT outcome, revision, decided_by, reason FROM public.aura_crm_quotation_review_decisions WHERE quotation_id = $1 ORDER BY decided_at',
      [rev0.id],
    );
    expect(decisions.rows).toEqual([
      { outcome: 'returned', revision: 0, decided_by: 'u-qs', reason: 'Re-rate the cameras' },
      { outcome: 'revised', revision: 0, decided_by: 'u-estimator', reason: 'Cameras re-rated as asked' },
    ]);
    const rows = await pool.query('SELECT id, revision, status, total, parent_quotation_id FROM public.aura_crm_quotations WHERE quote_number = $1 ORDER BY revision', [rev0.quoteNumber]);
    expect(rows.rows.map((r) => [r.revision, r.status])).toEqual([[0, 'revised'], [1, 'draft']]);
    expect(Number(rows.rows[0].total)).toBe(returned.total);
    expect(rows.rows[1].parent_quotation_id).toBe(rev0.id);
    expect(Number(rows.rows[1].total)).toBe(rev1.total);
    expect(rev1.total).toBeLessThan(returned.total);

    // A superseded revision is history — figures, terms and status alike.
    await refused('UPDATE public.aura_crm_quotations SET total = 1 WHERE id = $1', [rev0.id], /Rev 0 is immutable/);
    await refused("UPDATE public.aura_crm_quotations SET status = 'draft' WHERE id = $1", [rev0.id], /Rev 0 is immutable/);
    await refused("UPDATE public.aura_crm_quotations SET terms = 'rewritten' WHERE id = $1", [rev0.id], /Rev 0 is immutable/);
    // …while re-saving it unchanged through the upserting store stays harmless.
    await as(() => store.save((returned.status === 'draft' ? { ...returned, status: 'revised' } : returned) as never));

    // The review decisions are append-only.
    await refused("UPDATE public.aura_crm_quotation_review_decisions SET reason = 'softened' WHERE quotation_id = $1", [rev0.id], /review decision is immutable/);
    await refused('DELETE FROM public.aura_crm_quotation_review_decisions WHERE quotation_id = $1', [rev0.id], /review decision is immutable/);
  });

  it('a never-submitted draft refreshes in place; its figures freeze once it leaves draft', async () => {
    const tender = newId();
    const rev0 = await offer(tender, `QUO-B-${TENANT}`);
    const refreshed = await as(() => svc.refreshDraft(rev0.id, 'u-estimator', estimateAt(480)));
    const row = await pool.query('SELECT revision, total FROM public.aura_crm_quotations WHERE id = $1', [rev0.id]);
    expect(row.rows[0].revision).toBe(0);
    expect(Number(row.rows[0].total)).toBe(refreshed.total);
    await as(() => svc.changeStatus(rev0.id, 'approve', 'u-qs'));
    await refused("UPDATE public.aura_crm_quotations SET lines = '[]'::jsonb WHERE id = $1", [rev0.id], /immutable once it has left draft/);
  });

  it('a tender has one offer: a second quote number for it is refused, its next revision is not', async () => {
    const tender = newId();
    const rev0 = await offer(tender, `QUO-C-${TENANT}`);
    await expect(offer(tender, `QUO-C2-${TENANT}`)).rejects.toThrow(/a tender has one offer — QUO-C-/);
    await as(() => svc.changeStatus(rev0.id, 'approve', 'u-qs'));
    const rev1 = await as(() => svc.revise(rev0.id, 'u-estimator', { reason: 'Client asked for a lower camera spec', regenerated: estimateAt(400) }));
    expect(rev1.quoteNumber).toBe(rev0.quoteNumber);
    expect(rev1.revision).toBe(1);
    // A direct offer is untouched by the one-offer rule.
    await as(() => svc.create({ tenantId: TENANT, quoteNumber: `QUO-D-${TENANT}`, customerName: 'Emaar', issueDate: '2026-09-25', lines: [{ description: 'CCTV', quantity: 1, unitPrice: 10 }] }));
  });

  it('a decision outcome is one of the two, and its reason is never blank', async () => {
    const insert = (outcome: string, reason: string) => pool.query(
      `INSERT INTO public.aura_crm_quotation_review_decisions (id, tenant_id, quotation_id, quote_number, revision, outcome, reason)
       VALUES ($1, $2, $3, 'QUO-X', 0, $4, $5)`,
      [newId(), TENANT, newId(), outcome, reason],
    );
    await expect(insert('approved', 'a reason')).rejects.toThrow(/aura_crm_quotation_review_outcome/);
    await expect(insert('revised', '   ')).rejects.toThrow(/aura_crm_quotation_review_reason/);
  });
});
