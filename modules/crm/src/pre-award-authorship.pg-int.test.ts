import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { newId } from '@aura/shared';
import { PostgresPreAwardStore } from './postgres-pre-award-store';
import { approveScope, makeRequirement, makeSolutionScope } from './domain/solution-scope';

/**
 * J1-07 — REAL Postgres proof that authorship and the separation flag are STORED, not just returned.
 *
 * The API e2e for this runs on in-memory stores, so it proves the HTTP contract and the permissions
 * and nothing whatever about the schema. That gap is not theoretical here: `SCOPE_COLS` in this store
 * is shared between the SELECT and the INSERT, and the same shape in the recommendation store once
 * made every write 500 while the whole in-memory suite stayed green. Two new columns went into that
 * list, so the round-trip needs a database.
 *
 * It also pins the two things the domain cannot enforce on its own: that `created_by` is written once
 * and never restated by a later save, and that `separation_of_duties` is constrained at the row level
 * to the two values that mean something.
 *
 * Gated on CRM_PG_TEST_URL (migration 0361 applied).
 */
const URL = process.env.CRM_PG_TEST_URL;
const TENANT = `j107-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('J1-07 — scope authorship and separation of duties, in Postgres', () => {
  let pool: Pool;
  let store: PostgresPreAwardStore;
  const opportunityId = newId();

  const scopeFor = (author: string | null) =>
    makeSolutionScope({
      tenantId: TENANT, opportunityId, title: 'ELV — CCTV package', createdBy: author,
      lines: [{ discipline: 'CCTV', description: '4MP dome camera, installed', unit: 'nr', quantity: 24, unitPrice: 950 }],
    });

  /** Read the raw columns, not the mapper — a mapper can agree with a bug the database never saw. */
  const rawScope = async (id: string) => {
    const res = await pool.query<{ created_by: string | null; separation_of_duties: string | null; approved_by: string | null; total: string }>(
      'SELECT created_by, separation_of_duties, approved_by, total FROM public.aura_crm_solution_scopes WHERE id = $1', [id]);
    return res.rows[0];
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresPreAwardStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_crm_solution_scopes WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_crm_requirements WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  it('writes a scope with its author and reads it back', async () => {
    // The INSERT itself is the assertion here. Adding a name to the shared column list without its
    // placeholder throws "INSERT has more target columns than expressions" and nothing in-memory can
    // see it — every recommendation write 500'd that way once.
    const scope = scopeFor('u-e2e-presales');
    await store.saveScope(scope);

    expect(await rawScope(scope.id)).toMatchObject({ created_by: 'u-e2e-presales', separation_of_duties: null, approved_by: null });
    const read = await store.getScope(scope.id);
    expect(read?.createdBy).toBe('u-e2e-presales');
    expect(read?.separationOfDuties).toBeNull();
    expect(read?.total).toBe(22_800);
  });

  it('stores the separation verdict on approval, from the row the reviewer approved', async () => {
    const scope = scopeFor('u-e2e-presales');
    await store.saveScope(scope);

    const loaded = await store.getScope(scope.id);
    const approved = approveScope(loaded!, 'u-e2e-techmgr');
    await store.saveScope(approved);

    expect(await rawScope(scope.id)).toMatchObject({
      created_by: 'u-e2e-presales', approved_by: 'u-e2e-techmgr', separation_of_duties: 'enforced',
    });
  });

  it('never lets a later save restate who wrote it', async () => {
    // `created_by` is written on INSERT and left out of the DO UPDATE SET on purpose. If a re-save
    // could rewrite it, the author could edit their own scope, become "somebody else", and approve
    // it — the refusal would still be in the code and would simply never fire.
    const scope = scopeFor('u-e2e-presales');
    await store.saveScope(scope);
    await store.saveScope({ ...scope, createdBy: 'u-impostor', title: 'edited' });

    const row = await rawScope(scope.id);
    expect(row.created_by).toBe('u-e2e-presales');
    expect((await store.getScope(scope.id))?.title).toBe('edited'); // the edit landed; the authorship did not
  });

  it('records "unverifiable" for a scope written before authorship existed', async () => {
    // Legacy rows carry NULL and are deliberately not backfilled. The approval proceeds and says the
    // check could not run, which keeps the exception countable rather than silently indistinguishable
    // from an enforced one.
    const scope = scopeFor(null);
    await store.saveScope(scope);
    await store.saveScope(approveScope((await store.getScope(scope.id))!, 'u-anyone'));

    expect(await rawScope(scope.id)).toMatchObject({ created_by: null, separation_of_duties: 'unverifiable' });
  });

  it('refuses a separation verdict the database does not recognise', async () => {
    // The CHECK constraint from 0361. Without it, a future writer could store 'skipped', 'n/a' or ''
    // and the column would stop being an answer to the question it was added to answer.
    const scope = scopeFor('u-e2e-presales');
    await store.saveScope(scope);
    await expect(
      pool.query('UPDATE public.aura_crm_solution_scopes SET separation_of_duties = $2 WHERE id = $1', [scope.id, 'skipped']),
    ).rejects.toThrow(/aura_crm_scope_separation/);
  });

  it('writes a requirement with its author', async () => {
    // Same shared-column-list hazard, same proof. A requirement is somebody's account of what the
    // customer asked for, and who recorded it is part of what it is.
    const requirement = makeRequirement({
      tenantId: TENANT, opportunityId, title: '24 cameras, IP, 4MP minimum', priority: 'must', createdBy: 'u-e2e-sales',
    });
    await store.saveRequirement(requirement);

    const read = (await store.listRequirements(TENANT, opportunityId)).find((r) => r.id === requirement.id);
    expect(read?.createdBy).toBe('u-e2e-sales');
  });
});
