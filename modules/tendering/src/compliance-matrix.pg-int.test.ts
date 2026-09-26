import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { newId } from '@aura/shared';
import { PostgresComplianceMatrixStore } from './postgres-compliance-matrix-store';
import { makeComplianceMatrixIssue } from './domain/compliance-matrix';
import { row } from './compliance-matrix.fixture';

/**
 * EST-12 — REAL Postgres proof of migration 0393: the issued matrix is append-only, its revisions are
 * contiguous and reasoned, it is superseded once, and no commercial figure can be stored in it — through
 * the store the application uses and through raw SQL, which is what a second writer would do.
 * Gated on CRM_PG_TEST_URL (migrations to 0393).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `est12-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('EST-12 — the Technical Compliance Matrix in PostgreSQL (migration 0393)', () => {
  let pool: Pool;
  let store: PostgresComplianceMatrixStore;
  const tender = { id: newId(), reference: `TND-INT-${Date.now()}` };
  const base = { tenantId: TENANT, tender, issuedBy: 'u-e2e-techmgr', checksum: 'sha-test' };
  const refused = async (sql: string, params: unknown[], message: RegExp) => {
    const err = await pool.query(sql, params).then(() => null, (e: { message: string }) => e);
    expect(err, `expected refusal: ${sql}`).not.toBeNull();
    expect(err!.message).toMatch(message);
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresComplianceMatrixStore(pool);
  });

  afterAll(async () => { await pool?.end(); });

  it('issues Rev 0 and Rev 1, superseding Rev 0 once; both read back exactly', async () => {
    const rev0 = makeComplianceMatrixIssue({ ...base, previous: null, rows: [row()], documentId: newId() });
    await store.issue(null, rev0, null);
    const rev1 = makeComplianceMatrixIssue({ ...base, previous: rev0, rows: [row({ verdict: 'compliant_with_deviation', deviations: 'IR 25 m' })], reason: 'Al Noor clarified the IR range', documentId: newId() });
    await store.issue(null, rev1, rev0);

    const listed = await store.listByTender(TENANT, tender.id);
    expect(listed.map((i) => [i.revision, i.supersededBy, i.reason])).toEqual([[1, null, 'Al Noor clarified the IR range'], [0, rev1.id, null]]);
    expect(listed[1].rows[0]).toEqual(row());
    expect(listed[0].summary.compliantWithDeviation).toBe(1);

    // A second supersede of Rev 0 is refused, by the store and by SQL.
    const rev2 = makeComplianceMatrixIssue({ ...base, previous: rev1, rows: [row()], reason: 'again', documentId: newId() });
    await expect(store.issue(null, rev2, rev0)).rejects.toThrow();
    expect((await store.listByTender(TENANT, tender.id)).map((i) => i.revision), 'the failed issue left nothing behind').toEqual([1, 0]);
    await refused('UPDATE public.aura_tender_compliance_matrices SET superseded_by = $1, superseded_at = now() WHERE id = $2', [newId(), rev0.id], /Rev 0 is immutable/);

    // What was issued never changes, and is never deleted.
    await refused(`UPDATE public.aura_tender_compliance_matrices SET rows = '[]'::jsonb WHERE id = $1`, [rev1.id], /immutable/);
    await refused('UPDATE public.aura_tender_compliance_matrices SET issued_by = $1 WHERE id = $2', ['someone-else', rev1.id], /immutable/);
    await refused('DELETE FROM public.aura_tender_compliance_matrices WHERE id = $1', [rev1.id], /never deleted/);
  });

  const insert = (over: Record<string, unknown>) => {
    const v = {
      id: newId(), tenant_id: TENANT, tender_id: newId(), matrix_number: 'TCM-X', revision: 0, issued_by: 'u-e2e-techmgr',
      reason: null, rows: JSON.stringify([row()]), summary: '{}', document_id: newId(), checksum: 'c', ...over,
    };
    return pool.query(
      `INSERT INTO public.aura_tender_compliance_matrices
        (id, tenant_id, tender_id, matrix_number, revision, issued_by, issued_at, reason, rows, summary, document_id, checksum)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8::jsonb,$9::jsonb,$10,$11)`,
      [v.id, v.tenant_id, v.tender_id, v.matrix_number, v.revision, v.issued_by, v.reason, v.rows, v.summary, v.document_id, v.checksum],
    );
  };

  it('refuses a price, an empty matrix, a skipped revision and an unreasoned re-issue', async () => {
    const priced = JSON.stringify([{ ...row(), offered: { ...row().offered, unitPrice: 420 } }]);
    await expect(insert({ rows: priced })).rejects.toThrow(/aura_tcm_no_prices/);
    await expect(insert({ rows: '[]' })).rejects.toThrow(/aura_tcm_rows/);
    await expect(insert({ revision: 2 })).rejects.toThrow(/not the next revision/);
    const tenderId = newId();
    await insert({ tender_id: tenderId });
    await expect(insert({ tender_id: tenderId, revision: 1, reason: null })).rejects.toThrow(/aura_tcm_reissue_reason/);
    await expect(insert({ tender_id: tenderId, revision: 1, reason: '   ' })).rejects.toThrow(/aura_tcm_reissue_reason/);
    await expect(insert({ issued_by: '  ' })).rejects.toThrow(/aura_tcm_issuer/);
  });
});
