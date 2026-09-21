import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresSnagStore } from './postgres-snag-store';
import { PostgresItpStore } from './postgres-itp-store';
import { makeSnag, resolveSnag, closeSnag } from './domain/snag';
import { makeItp, activateItp, recordPointResult, closeItp } from './domain/itp';

/**
 * SEC-01 wave D — REAL Postgres proof for the quality register.
 *
 * Seven columns went into two hand-maintained INSERT statements here. The wave-C submittal insert
 * shipped with 19 columns against 17 placeholders, and the site instruction SELECT in this same wave
 * silently omitted its three new columns so the mapper returned null for all of them — caught only
 * by a test like this one, because the raw row was correct and every unit test was green.
 *
 * Gated on QUALITY_PG_TEST_URL (migration 0373 applied).
 */
const URL = process.env.QUALITY_PG_TEST_URL;
const TENANT = `waved-q-${Date.now()}`;
const PROJECT = '00000000-0000-0000-0000-0000000000d2';
const run = URL ? describe : describe.skip;

run('Wave D — quality register provenance, in Postgres', () => {
  let pool: Pool;
  let snags: PostgresSnagStore;
  let itps: PostgresItpStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    snags = new PostgresSnagStore(pool);
    itps = new PostgresItpStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_quality_snags WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_quality_itps  WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  const snag = () => makeSnag({
    tenantId: TENANT, projectId: PROJECT, description: 'Tray unpainted', locationDetail: 'L3 riser',
    severity: 'medium', createdBy: 'u-qaqc',
  });

  it('round-trips the snag lifecycle actors through the INSERT and back out of the mapper', async () => {
    const closed = closeSnag(resolveSnag(snag(), 'u-qaqc'), 'u-qaqc-2');
    await snags.save(closed);

    // RAW columns first — a mapper can agree with a bug the database never saw.
    const raw = await pool.query<{ resolved_by: string | null; closed_by: string | null; closed_at: Date | null; status: string }>(
      'SELECT resolved_by, closed_by, closed_at, status FROM public.aura_quality_snags WHERE id = $1', [closed.id]);
    expect(raw.rows[0]).toMatchObject({ resolved_by: 'u-qaqc', closed_by: 'u-qaqc-2', status: 'closed' });
    expect(raw.rows[0].closed_at).not.toBeNull();

    // …then the mapper, which is where the site instruction's SELECT list went wrong in this wave.
    const read = await snags.findById(closed.id, TENANT);
    expect(read?.resolvedBy).toBe('u-qaqc');
    expect(read?.closedBy).toBe('u-qaqc-2');
    expect(read?.closedAt).not.toBeNull();
  });

  it('refuses a closed snag that names nobody, and close metadata that disagrees with the status', async () => {
    const s = snag();
    await snags.save(s);
    await expect(
      pool.query("UPDATE public.aura_quality_snags SET closed_at = now(), closed_by = NULL WHERE id = $1", [s.id]),
    ).rejects.toThrow(/aura_quality_snag_closed_complete/);
    // A close time on a snag that is not closed: the provenance and the status cannot disagree.
    await expect(
      pool.query("UPDATE public.aura_quality_snags SET closed_at = now(), closed_by = 'u-x', status = 'open' WHERE id = $1", [s.id]),
    ).rejects.toThrow(/aura_quality_snag_closed_status/);
  });

  it('round-trips both ITP actors — the plan that was put in force and closed by nobody', async () => {
    const itp = makeItp({
      tenantId: TENANT, projectId: PROJECT, reference: `ITP-${Date.now()}`, title: 'Containment inspection',
      points: [{ activity: 'Tray alignment', pointType: 'witness' }],
    });
    const closed = closeItp(recordPointResult(activateItp(itp, 'u-qaqc'), 0, 'passed'), 'u-qaqc-2');
    await itps.save(closed);

    const raw = await pool.query<{ activated_by: string | null; activated_at: Date | null; closed_by: string | null; closed_at: Date | null }>(
      'SELECT activated_by, activated_at, closed_by, closed_at FROM public.aura_quality_itps WHERE id = $1', [closed.id]);
    expect(raw.rows[0].activated_by).toBe('u-qaqc');
    expect(raw.rows[0].closed_by).toBe('u-qaqc-2');
    expect(raw.rows[0].activated_at).not.toBeNull();
    expect(raw.rows[0].closed_at).not.toBeNull();

    const read = await itps.findById(closed.id, TENANT);
    expect(read?.activatedBy).toBe('u-qaqc');
    expect(read?.closedBy).toBe('u-qaqc-2');
  });

  it('refuses half-recorded ITP provenance on either act', async () => {
    const itp = makeItp({
      tenantId: TENANT, projectId: PROJECT, reference: `ITP-BAD-${Date.now()}`, title: 'x',
      points: [{ activity: 'a', pointType: 'hold' }],
    });
    await itps.save(itp);
    await expect(
      pool.query("UPDATE public.aura_quality_itps SET activated_by = 'u-x', activated_at = NULL WHERE id = $1", [itp.id]),
    ).rejects.toThrow(/aura_quality_itp_activated_complete/);
    await expect(
      pool.query("UPDATE public.aura_quality_itps SET closed_at = now(), closed_by = NULL WHERE id = $1", [itp.id]),
    ).rejects.toThrow(/aura_quality_itp_closed_complete/);
  });

  it('refuses an ITP declared complete that was never put in force', async () => {
    // Closing a plan nobody was working to would mean declaring inspections complete for
    // inspections that were never in force. `NOT VALID`, so this asserts it binds forward.
    const itp = makeItp({
      tenantId: TENANT, projectId: PROJECT, reference: `ITP-NEVER-${Date.now()}`, title: 'x',
      points: [{ activity: 'a', pointType: 'hold' }],
    });
    await itps.save(itp);
    await expect(
      pool.query("UPDATE public.aura_quality_itps SET status = 'closed', closed_by = 'u-x', closed_at = now() WHERE id = $1", [itp.id]),
    ).rejects.toThrow(/aura_quality_itp_close_after_activate/);
  });
});
