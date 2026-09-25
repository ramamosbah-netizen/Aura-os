import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresEscalationStore } from './postgres-escalation-store';
import { makeEscalation, decideNcrRaised } from './domain/escalation';

/**
 * ESCALATIONS, HELD BY THE DATABASE (migration 0390) — TC-08. As `aura_app` (NOBYPASSRLS), through the
 * real store first, then by hand. SKIPS without a database rather than passing quietly.
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

const TENANT = `esc-${Date.now()}`;
const PROJECT = newId();

describe('escalations, enforced by PostgreSQL (migration 0390)', () => {
  let pool: Pool | null = null;
  let admin: Pool | null = null;
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
      await cleaner.query(`DELETE FROM public.aura_quality_escalations WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
      await cleaner.query(`SET session_replication_role = origin`).catch(() => undefined);
    }
    await pool?.end();
    await admin?.end();
  });

  const asked = () => makeEscalation({ tenantId: TENANT, projectId: PROJECT, sourceId: newId(), description: 'Camera out of focus', requestedBy: 'u-tc' });

  skipless('through the real store: received once per defect, decided once, then immutable', async () => {
    const store = new PostgresEscalationStore(pool!);
    const e = asked();
    await store.save(e);
    expect(await store.findBySource(TENANT, e.sourceId)).toMatchObject({ id: e.id, status: 'pending' });
    await expect(store.save({ ...asked(), sourceId: e.sourceId })).rejects.toThrow(/uq_aura_quality_escalation_source/);
    const decided = decideNcrRaised(e, { ncrId: newId(), actorId: 'u-qa' });
    await store.save(decided);
    expect(await store.findById(e.id, TENANT)).toMatchObject({ status: 'ncr_raised', decidedBy: 'u-qa' });
    await expect(store.save({ ...decided, status: 'pending', ncrId: null, decidedBy: null, decidedAt: null })).rejects.toThrow(/decided escalation is immutable/);
  });

  skipless('by hand: the asker deciding, an incomplete decision, a rewritten request, a deleted decision — all refused', async () => {
    const store = new PostgresEscalationStore(pool!);
    const e = asked();
    await store.save(e);
    expect(await refused(`UPDATE public.aura_quality_escalations SET status='not_nonconformance', decision_reason='x', decided_by='u-tc', decided_at=now() WHERE id=$1`, [e.id]))
      .toMatch(/aura_quality_escalation_independent/);
    expect(await refused(`UPDATE public.aura_quality_escalations SET status='not_nonconformance', decided_by='u-qa', decided_at=now() WHERE id=$1`, [e.id]))
      .toMatch(/aura_quality_escalation_decision/);
    expect(await refused(`UPDATE public.aura_quality_escalations SET requested_by='u-other' WHERE id=$1`, [e.id])).toMatch(/request is immutable/);
    await pool!.query(`UPDATE public.aura_quality_escalations SET status='not_nonconformance', decision_reason='A snag, not an NCR', decided_by='u-qa', decided_at=now() WHERE id=$1`, [e.id]);
    expect(await refused(`DELETE FROM public.aura_quality_escalations WHERE id=$1`, [e.id])).toMatch(/never deleted/);
  });
});
