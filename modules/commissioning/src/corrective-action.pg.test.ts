import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresCommissioningStore } from './postgres-commissioning-store';
import { makeCommissioningRecord } from './domain/commissioning-record';
import { makeTestItem } from './domain/commissioning-test-item';
import { makePunchItem, routeToEngineering, recordCorrectiveAction, closePunch } from './domain/punch-item';

/**
 * CORRECTIVE ACTION, HELD BY THE DATABASE (migration 0389) — TC-08.
 *
 * As `aura_app` (NOBYPASSRLS, the production role), through the REAL store's upserts first — the path
 * the application takes — and then by hand, for what no service would try. SKIPS without a database.
 */
function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith(`${name}=`)) return line.slice(name.length + 1).trim();
    }
  } catch {
    // no env file — "no database", which is a skip
  }
  return undefined;
}

const TENANT = `cax-${Date.now()}`;
const PROJECT = newId();

describe('corrective action, enforced by PostgreSQL (migration 0389)', () => {
  let pool: Pool | null = null;
  let admin: Pool | null = null;
  const q = (sql: string, params: unknown[] = []) => pool!.query(sql, params);
  const refused = async (sql: string, params: unknown[] = []): Promise<string> => {
    try { await pool!.query(sql, params); } catch (err) { return (err as Error).message; }
    throw new Error(`expected the database to refuse:\n${sql}`);
  };
  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => { if (!pool) { ctx.skip(); return; } await body(); }, 60_000);

  beforeAll(async () => {
    const url = envValue('DATABASE_URL');
    if (!url) return;
    pool = new Pool({ connectionString: url, max: 1 });
    pool.on('connect', (client) => { void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`); });
    const adminUrl = envValue('MIGRATION_DATABASE_URL');
    if (adminUrl) admin = new Pool({ connectionString: adminUrl, max: 1 });
  });

  afterAll(async () => {
    const cleaner = admin ?? pool;
    if (cleaner) {
      await cleaner.query(`SET session_replication_role = replica`).catch(() => undefined);
      for (const table of ['aura_commissioning_punch_items', 'aura_commissioning_test_items', 'aura_commissioning_records']) {
        await cleaner.query(`DELETE FROM public.${table} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
      }
      await cleaner.query(`SET session_replication_role = origin`).catch(() => undefined);
    }
    await pool?.end();
    await admin?.end();
  });

  /** An unbound CCTV record with one typed point that failed, and the defect raised from it. */
  const fixture = async () => {
    const store = new PostgresCommissioningStore(pool!);
    const rec = makeCommissioningRecord({ tenantId: TENANT, projectId: PROJECT, code: `CA-${Math.random().toString(36).slice(2, 7)}`, title: 'CCTV', system: 'cctv' });
    await store.save(rec);
    const point = makeTestItem({ tenantId: TENANT, commissioningId: rec.id, projectId: PROJECT, pointNo: 'IMG-01', description: 'Camera image' });
    await store.saveTestItem(point);
    await store.saveTestItem({ ...point, result: 'fail', testedAt: new Date().toISOString() });
    const defect = makePunchItem({ tenantId: TENANT, commissioningId: rec.id, projectId: PROJECT, description: 'IR under-specified', severity: 'major', testItemId: point.id });
    await store.savePunchItem(defect);
    return { store, rec, point, defect };
  };

  skipless('through the real store: route, correct, retest, then close — and not before', async () => {
    const { store, point, defect } = await fixture();
    const routed = { ...routeToEngineering(defect, { assigneeId: 'u-eng', reason: 'Design change', routedBy: 'u-tc' }), routingReceiptId: 'resp-1' };
    await store.savePunchItem(routed);
    const corrected = recordCorrectiveAction(routed, { action: 'IR upgraded', reference: 'DWG-004 rev C', actorId: 'u-eng' });
    // Closing BEFORE the retest — the database refuses what the domain was told to allow.
    await expect(store.savePunchItem(closePunch(corrected, { resolution: 'done', closedBy: 'u-tc' }, 'pass')))
      .rejects.toThrow(/before|retest of its test point has passed|corrective action/);
    await store.savePunchItem(corrected);
    await expect(store.savePunchItem(closePunch(corrected, { resolution: 'done', closedBy: 'u-tc' }, 'pass')))
      .rejects.toThrow(/retest of its test point has passed/);
    await store.saveTestItem({ ...point, result: 'pass', testedAt: new Date().toISOString() });
    await store.savePunchItem(closePunch(corrected, { resolution: 'Upgraded and retested', closedBy: 'u-tc' }, 'pass'));
    const row = (await q(`SELECT status, routed_to, corrective_action, corrected_by FROM public.aura_commissioning_punch_items WHERE id = $1`, [defect.id])).rows[0];
    expect(row).toMatchObject({ status: 'closed', routed_to: 'u-eng', corrective_action: 'IR upgraded', corrected_by: 'u-eng' });
  });

  skipless('by hand: raised routed, corrected by somebody else, re-routed, or a closed defect rewritten — all refused', async () => {
    const { defect, rec } = await fixture();
    expect(await refused(
      `INSERT INTO public.aura_commissioning_punch_items (id, tenant_id, commissioning_id, project_id, description, severity, status, routed_to, routed_by, routed_at, routing_reason)
       VALUES ($1,$2,$3,$4,'x','minor','open','u-eng','u-tc',now(),'r')`, [newId(), TENANT, rec.id, PROJECT],
    )).toMatch(/raised open/);
    await q(`UPDATE public.aura_commissioning_punch_items SET routed_to='u-eng', routed_by='u-tc', routed_at=now(), routing_reason='Design change' WHERE id=$1`, [defect.id]);
    expect(await refused(`UPDATE public.aura_commissioning_punch_items SET routed_to='u-eng-2' WHERE id=$1`, [defect.id])).toMatch(/immutable once made/);
    expect(await refused(`UPDATE public.aura_commissioning_punch_items SET corrective_action='x', corrected_by='u-other', corrected_at=now() WHERE id=$1`, [defect.id]))
      .toMatch(/aura_punch_correction_by_assignee/);
    expect(await refused(`UPDATE public.aura_commissioning_punch_items SET routing_reason='  ' WHERE id=$1`, [defect.id])).toMatch(/immutable once made|aura_punch_routing_complete/);

    // An unrouted defect closes as before — and once closed it is not rewritten.
    const plain = makePunchItem({ tenantId: TENANT, commissioningId: rec.id, projectId: PROJECT, description: 'Label missing' });
    await new PostgresCommissioningStore(pool!).savePunchItem(plain);
    await q(`UPDATE public.aura_commissioning_punch_items SET status='closed', resolution='Labelled', closed_by='u-tc', closed_at=now() WHERE id=$1`, [plain.id]);
    expect(await refused(`UPDATE public.aura_commissioning_punch_items SET resolution='rewritten' WHERE id=$1`, [plain.id])).toMatch(/closed defect is immutable/);
  });
});
