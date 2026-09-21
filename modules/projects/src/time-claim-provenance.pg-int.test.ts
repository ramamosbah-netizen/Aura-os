import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresEotStore } from './postgres-delay-eot-store';
import { makeEotClaim, submitEotClaim, decideEotClaim } from './domain/delay-eot';

/**
 * SEC-01 wave E — REAL Postgres proof for the time claim and the cancellation.
 *
 * Five columns went into two hand-maintained statements. The project INSERT's column list is a
 * shared `COLS` constant while its placeholders are written out by hand, so adding three columns
 * left 39 columns against 36 placeholders — the same arity class that shipped in wave C and that
 * only a real database catches. Wave D added a second variant of it: a SELECT list that silently
 * omitted its new columns, so the raw row was right and the mapper returned null.
 *
 * Gated on PROJECTS_PG_TEST_URL (migration 0374 applied).
 */
const URL = process.env.PROJECTS_PG_TEST_URL;
const TENANT = `wavee-int-${Date.now()}`;
const PROJECT = '00000000-0000-0000-0000-0000000000e1';
const run = URL ? describe : describe.skip;

run('Wave E — time-claim and cancellation provenance, in Postgres', () => {
  let pool: Pool;
  let eots: PostgresEotStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    eots = new PostgresEotStore(pool);
    // A claim hangs off a real project — there is a foreign key, and it is right that there is.
    await pool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title, status, created_at)
       VALUES ($1, $2, 'Wave E fixture project', 'active', now()) ON CONFLICT (id) DO NOTHING`,
      [PROJECT, TENANT]);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_projects_eot_claims WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_projects_projects   WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  let n = 0;
  const claim = () => makeEotClaim({
    tenantId: TENANT, projectId: PROJECT, claimNumber: ++n, title: 'Delayed access to level 3',
    submittedDays: 14, createdBy: 'u-commercial-manager',
  });

  it('round-trips the author, the submitter and the determiner', async () => {
    const decided = decideEotClaim(
      submitEotClaim(claim(), 'u-commercial-manager'),
      { status: 'partially_approved', approvedDays: 9 },
      'u-project-manager',
    );
    await eots.create(decided);

    // RAW columns, not the mapper — a mapper can agree with a bug the database never saw, and in
    // wave D a SELECT list that dropped its new columns did exactly that.
    const raw = await pool.query<{ created_by: string | null; submitted_by: string | null; decided_by: string | null }>(
      'SELECT created_by, submitted_by, decided_by FROM public.aura_projects_eot_claims WHERE id = $1', [decided.id]);
    expect(raw.rows[0]).toEqual({
      created_by: 'u-commercial-manager',
      submitted_by: 'u-commercial-manager',
      decided_by: 'u-project-manager',
    });

    const read = await eots.get(decided.id);
    expect(read?.createdBy).toBe('u-commercial-manager');
    expect(read?.submittedBy).toBe('u-commercial-manager');
    expect(read?.decidedBy).toBe('u-project-manager');
  });

  it('does not let a later save restate the authorship', async () => {
    const c = claim();
    await eots.create(c);
    // `created_by` is deliberately absent from the UPDATE's SET list.
    await eots.update({ ...c, createdBy: 'u-someone-else', title: 'Retitled' });
    const raw = await pool.query<{ created_by: string | null; title: string }>(
      'SELECT created_by, title FROM public.aura_projects_eot_claims WHERE id = $1', [c.id]);
    expect(raw.rows[0].title).toBe('Retitled');
    expect(raw.rows[0].created_by).toBe('u-commercial-manager');
  });

  it('binds submitter != determiner on the row itself', async () => {
    const c = await (async () => { const x = claim(); await eots.create(x); return x; })();
    await expect(
      pool.query("UPDATE public.aura_projects_eot_claims SET submitted_at = now(), submitted_by = 'u-a', decided_at = now(), decided_by = 'u-a' WHERE id = $1", [c.id]),
    ).rejects.toThrow(/aura_projects_eot_submit_not_decide/);
    await expect(
      pool.query("UPDATE public.aura_projects_eot_claims SET submitted_at = now(), submitted_by = 'u-a', decided_at = now(), decided_by = 'u-b' WHERE id = $1", [c.id]),
    ).resolves.toBeTruthy();
  });

  it('refuses a determination on a claim that was never submitted, and half-recorded provenance', async () => {
    const c = await (async () => { const x = claim(); await eots.create(x); return x; })();
    await expect(
      pool.query("UPDATE public.aura_projects_eot_claims SET decided_at = now(), decided_by = 'u-b' WHERE id = $1", [c.id]),
    ).rejects.toThrow(/aura_projects_eot_decide_after_submit/);
    await expect(
      pool.query("UPDATE public.aura_projects_eot_claims SET submitted_at = now(), decided_at = now(), decided_by = NULL WHERE id = $1", [c.id]),
    ).rejects.toThrow(/aura_projects_eot_decided_complete/);
  });

  it('refuses a cancelled project that says who but not why, and metadata that contradicts the status', async () => {
    const id = `00000000-0000-0000-0000-${String(Date.now() % 1e12).padStart(12, '0')}`;
    await pool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title, status, created_at)
       VALUES ($1, $2, 'Wave E cancellation fixture', 'active', now())`, [id, TENANT]);

    // `btrim(x) <> ''` is NULL when x is NULL and a CHECK PASSES on NULL — the hole that shipped in
    // 0362. The explicit `is not null` test is what makes this bind.
    await expect(
      pool.query("UPDATE public.aura_projects_projects SET status='cancelled', cancelled_by='u-pm', cancelled_at=now(), cancellation_reason=NULL WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_projects_cancelled_complete/);
    await expect(
      pool.query("UPDATE public.aura_projects_projects SET status='cancelled', cancelled_by='u-pm', cancelled_at=now(), cancellation_reason='   ' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_projects_cancelled_complete/);
    // Cancellation metadata on a project that is not cancelled.
    await expect(
      pool.query("UPDATE public.aura_projects_projects SET cancelled_by='u-pm', cancelled_at=now(), cancellation_reason='Client withdrew' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_projects_cancelled_status/);
    // The complete, honest shape.
    await expect(
      pool.query("UPDATE public.aura_projects_projects SET status='cancelled', cancelled_by='u-pm', cancelled_at=now(), cancellation_reason='Client withdrew the award' WHERE id = $1", [id]),
    ).resolves.toBeTruthy();

    await pool.query('DELETE FROM public.aura_projects_projects WHERE id = $1', [id]);
  });
});
