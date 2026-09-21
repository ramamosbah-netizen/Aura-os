import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresSiteInstructionStore } from './postgres-site-store';
import { makeSiteInstruction, acknowledgeInstruction, closeInstruction } from './domain/site-instruction';

/**
 * SEC-01 wave D — REAL Postgres proof for the site half.
 *
 * Five columns went into two hand-maintained INSERT statements across this wave, and the submittal
 * insert in wave C shipped with 19 columns against 17 placeholders — an arity mismatch no
 * type-checker and no in-memory test can see. The site instruction insert grew by three.
 *
 * It also pins the row-level rule the daily report needed no new columns for: the person who
 * prepared or submitted the day may not be the one who approved it. That constraint is `NOT VALID`,
 * so this asserts it binds FORWARD while the violating history stays readable.
 *
 * Gated on SITE_PG_TEST_URL (migration 0373 applied).
 */
const URL = process.env.SITE_PG_TEST_URL;
const TENANT = `waved-int-${Date.now()}`;
const PROJECT = '00000000-0000-0000-0000-0000000000d1';
const run = URL ? describe : describe.skip;

run('Wave D — site execution provenance, in Postgres', () => {
  let pool: Pool;
  let store: PostgresSiteInstructionStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    store = new PostgresSiteInstructionStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_site_instructions   WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_site_daily_reports  WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  const instruction = () => makeSiteInstruction({
    tenantId: TENANT, projectId: PROJECT, reference: `SI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    issuedBy: 'A. Consultant', issuedByUserId: 'u-project-engineer',
    date: '2026-09-18', instruction: 'Relocate the riser', costImplication: true, timeImplication: true,
  });

  it('round-trips the actor AND the free-text label — three columns into a hand-written INSERT', async () => {
    const closed = closeInstruction(acknowledgeInstruction(instruction(), 'u-site-engineer'), 'u-project-engineer');
    await store.save(closed);

    // RAW columns, not the mapper. A mapper can agree with a bug the database never saw.
    const raw = await pool.query<{ issued_by: string; issued_by_user_id: string | null; acknowledged_by: string | null; closed_by: string | null; closed_at: Date | null }>(
      'SELECT issued_by, issued_by_user_id, acknowledged_by, closed_by, closed_at FROM public.aura_site_instructions WHERE id = $1',
      [closed.id]);
    expect(raw.rows[0]).toMatchObject({
      issued_by: 'A. Consultant',            // the named representative, who need not be a user
      issued_by_user_id: 'u-project-engineer', // the account that acted
      acknowledged_by: 'u-site-engineer',
      closed_by: 'u-project-engineer',
    });
    expect(raw.rows[0].closed_at).not.toBeNull();

    const read = await store.findById(closed.id, TENANT);
    expect(read?.issuedByUserId).toBe('u-project-engineer');
    expect(read?.closedBy).toBe('u-project-engineer');
  });

  it('binds preparer/submitter != approver on the daily report row itself', async () => {
    // The report needed NO new columns — it already had four actor columns and four timestamps.
    // What it needed was the rule, and this is the rule on the row. `NOT VALID`, because the probe
    // that MEASURED this defect produced a row with all four columns equal and that row is the
    // evidence; the constraint binds every insert and update from here on, which is what this
    // asserts.
    const id = randomUUID();
    await pool.query(
      `INSERT INTO public.aura_site_daily_reports
         (id, tenant_id, project_id, report_number, date, work_description, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '2026-09-18', 'Containment', 'draft', now(), now())`,
      [id, TENANT, PROJECT, `DR-${Date.now()}`]);

    await expect(
      pool.query("UPDATE public.aura_site_daily_reports SET prepared_by='u-a', approved_by='u-a' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_site_report_preparer_not_approver/);

    await expect(
      pool.query("UPDATE public.aura_site_daily_reports SET prepared_by='u-a', submitted_by='u-a', approved_by='u-a' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_site_report_preparer_not_approver/);

    // The submitter is caught even when somebody else prepared it — both columns are tested,
    // because either one is "the person whose day this is".
    await expect(
      pool.query("UPDATE public.aura_site_daily_reports SET prepared_by='u-a', submitted_by='u-b', approved_by='u-b' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_site_report_preparer_not_approver/);

    // Two different people go through.
    await expect(
      pool.query("UPDATE public.aura_site_daily_reports SET prepared_by='u-a', submitted_by='u-a', approved_by='u-b', approved_at=now() WHERE id = $1", [id]),
    ).resolves.toBeTruthy();

    await pool.query('DELETE FROM public.aura_site_daily_reports WHERE id = $1', [id]);
  });
});
