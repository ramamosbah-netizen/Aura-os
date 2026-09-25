import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresCommissioningStore } from './postgres-commissioning-store';
import { makeCommissioningRecord } from './domain/commissioning-record';
import { makeTestItem } from './domain/commissioning-test-item';

/**
 * THE APPROVED CHECKLIST, HELD BY THE DATABASE (migration 0388) — TC-08 / TC-09.
 *
 * Quality owns the checklist; T&C executes it. The service refuses every way round that, and this
 * proves PostgreSQL refuses too — so neither a code path nobody has written yet nor a direct write
 * can: a self-approved revision, an edit to an approved one, a record bound to another project's or
 * another system's checklist, a hand-typed point on a bound record, and a system commissioned while
 * a mandatory point is open, a point is failing or a defect is open.
 *
 * Raw SQL as `aura_app` (NOBYPASSRLS, the production role), so row-level security applies exactly as
 * in the application. One fixture — an already-commissioned legacy record from before 0388 — is
 * written through the migration connection with triggers bypassed, because no application path can
 * create one any more, which is the point. It SKIPS without a database rather than passing quietly.
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

const TENANT = `acl-${Date.now()}`;
const P1 = newId();
const P2 = newId();
const POINTS_V1 = [
  { code: 'CCTV-01', activity: 'Field of view against the approved layout', acceptanceCriteria: 'Every camera covers its drawn field of view', mandatory: true, pointType: 'witness', method: null, result: 'pending' },
  { code: 'CCTV-02', activity: 'NVR recording retention', acceptanceCriteria: '30 days at the specified resolution', mandatory: true, pointType: 'witness', method: null, result: 'pending' },
  { code: 'CCTV-03', activity: 'Workstation layout review', acceptanceCriteria: 'Matches the approved drawing', mandatory: false, pointType: 'review', method: null, result: 'pending' },
];

describe('the approved checklist, enforced by PostgreSQL (migration 0388)', () => {
  let pool: Pool | null = null;
  let admin: Pool | null = null;
  const template = newId();
  const approvedCctv = newId();       // P1 · cctv · rev 1 · approved
  const draftAcs = newId();           // P1 · access_control · rev 1 · draft
  const installation = newId();       // P1 · installation-inspection plan
  const approvedCctvP2 = newId();     // P2 · cctv · rev 1 · approved

  const q = (sql: string, params: unknown[] = []) => pool!.query(sql, params);
  const refused = async (sql: string, params: unknown[] = []): Promise<string> => {
    try { await pool!.query(sql, params); } catch (err) { return (err as Error).message; }
    throw new Error(`expected the database to refuse:\n${sql}`);
  };
  const skipless = (name: string, body: (ctx: { skip: () => void }) => Promise<void>) =>
    it(name, async (ctx) => { if (!pool) { ctx.skip(); return; } await body(ctx); }, 60_000);

  const systemItp = (id: string, over: Record<string, unknown>) => {
    const row: Record<string, unknown> = {
      id, tenant_id: TENANT, project_id: P1, reference: `ITP-${id.slice(0, 6)}`, title: 'CCTV checklist', discipline: 'elv',
      status: 'approved', points: JSON.stringify(POINTS_V1), created_by: 'qa-1', submitted_by: 'qa-1', submitted_at: new Date().toISOString(),
      approved_by: 'qa-2', approved_at: new Date().toISOString(), kind: 'system_commissioning', system: 'cctv', revision: 1,
      source_template_id: template, source_template_version: 1, ...over,
    };
    const cols = Object.keys(row);
    return q(`INSERT INTO public.aura_quality_itps (${cols.join(',')}) VALUES (${cols.map((c, i) => (c === 'points' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(',')})`, Object.values(row));
  };
  const record = (over: Record<string, unknown>) => {
    const row: Record<string, unknown> = { id: newId(), tenant_id: TENANT, project_id: P1, code: `CX-${Math.random().toString(36).slice(2, 7)}`, title: 'CCTV — Tower A', system: 'cctv', status: 'in_progress', ...over };
    const cols = Object.keys(row);
    return q(`INSERT INTO public.aura_commissioning_records (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row)).then(() => row.id as string);
  };
  const bind = (itpId: string, rev = 1) => ({ itp_id: itpId, itp_revision: rev, itp_bound_by: 'tc-1', itp_bound_at: new Date().toISOString() });
  const point = (recordId: string, over: Record<string, unknown>) => {
    const row: Record<string, unknown> = { id: newId(), tenant_id: TENANT, commissioning_id: recordId, project_id: P1, point_no: '1', description: 'x', result: 'pending', ...over };
    const cols = Object.keys(row);
    return q(`INSERT INTO public.aura_commissioning_test_items (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row)).then(() => row.id as string);
  };
  const itpPoint = (recordId: string, itpId: string, code: string, mandatory: boolean, result = 'pending') =>
    point(recordId, { origin: 'itp', itp_id: itpId, itp_point_code: code, mandatory, point_no: code, description: code, expected: 'criterion', result });

  beforeAll(async () => {
    const url = envValue('DATABASE_URL');
    if (!url) return;
    pool = new Pool({ connectionString: url, max: 1 });
    pool.on('connect', (client) => { void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`); });
    const adminUrl = envValue('MIGRATION_DATABASE_URL');
    if (adminUrl) admin = new Pool({ connectionString: adminUrl, max: 1 });

    await q(`INSERT INTO public.aura_quality_itp_templates (id, tenant_id, system, version, title, status, points, created_by, published_by, published_at)
             VALUES ($1,$2,'cctv',1,'CCTV checklist','published',$3::jsonb,'qa-1','qa-1',now())`, [template, TENANT, JSON.stringify(POINTS_V1)]);
    await systemItp(approvedCctv, {});
    await systemItp(draftAcs, { status: 'draft', system: 'access_control', submitted_by: null, submitted_at: null, approved_by: null, approved_at: null });
    await systemItp(approvedCctvP2, { project_id: P2 });
    await q(`INSERT INTO public.aura_quality_itps (id, tenant_id, project_id, reference, title, discipline, status, points)
             VALUES ($1,$2,$3,'ITP-INST','Containment','elv','active','[]'::jsonb)`, [installation, TENANT, P1]);
  });

  afterAll(async () => {
    const cleaner = admin ?? pool;
    if (cleaner) {
      for (const table of ['aura_commissioning_punch_items', 'aura_commissioning_test_items', 'aura_commissioning_records', 'aura_quality_itps', 'aura_quality_itp_templates']) {
        // The guards refuse deleting approved revisions and published templates, so cleanup runs
        // with triggers bypassed on the migration connection.
        await cleaner.query(`SET session_replication_role = replica`).catch(() => undefined);
        await cleaner.query(`DELETE FROM public.${table} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
      }
      await cleaner.query(`SET session_replication_role = origin`).catch(() => undefined);
    }
    await pool?.end();
    await admin?.end();
  });

  describe('the tenant library', () => {
    skipless('a published template is frozen, and can only be retired', async () => {
      expect(await refused(`UPDATE public.aura_quality_itp_templates SET points = '[]'::jsonb WHERE id = $1`, [template])).toMatch(/published ITP template is immutable/);
      expect(await refused(`DELETE FROM public.aura_quality_itp_templates WHERE id = $1`, [template])).toMatch(/published ITP template is immutable/);
    });
    skipless('a template names a system — "other" names none', async () => {
      expect(await refused(`INSERT INTO public.aura_quality_itp_templates (id, tenant_id, system, version, title) VALUES ($1,$2,'other',1,'x')`, [newId(), TENANT]))
        .toMatch(/aura_itp_template_system/);
    });
  });

  describe('the project system ITP revision', () => {
    skipless('refuses a revision approved by the person who prepared it', async () => {
      const m = await refused(`INSERT INTO public.aura_quality_itps (id, tenant_id, project_id, reference, title, status, points, kind, system, revision, created_by, submitted_by, approved_by, approved_at)
        VALUES ($1,$2,$3,'SELF','x','approved','[]'::jsonb,'system_commissioning','intercom',1,'qa-1','qa-1','qa-1',now())`, [newId(), TENANT, P1]);
      expect(m).toMatch(/aura_itp_independent_approval/);
    });
    skipless('an approved revision is frozen — points, criteria, mandatory flags, system — and cannot be deleted', async () => {
      const edited = POINTS_V1.map((p, i) => (i === 1 ? { ...p, acceptanceCriteria: '7 days' } : p));
      expect(await refused(`UPDATE public.aura_quality_itps SET points = $2::jsonb WHERE id = $1`, [approvedCctv, JSON.stringify(edited)])).toMatch(/approved ITP revision is immutable/);
      const optional = POINTS_V1.map((p) => ({ ...p, mandatory: false }));
      expect(await refused(`UPDATE public.aura_quality_itps SET points = $2::jsonb WHERE id = $1`, [approvedCctv, JSON.stringify(optional)])).toMatch(/approved ITP revision is immutable/);
      expect(await refused(`UPDATE public.aura_quality_itps SET system = 'intercom' WHERE id = $1`, [approvedCctv])).toMatch(/approved ITP revision is immutable/);
      expect(await refused(`DELETE FROM public.aura_quality_itps WHERE id = $1`, [approvedCctv])).toMatch(/approved ITP revision is immutable/);
      expect(await refused(`UPDATE public.aura_quality_itps SET kind = 'installation_inspection' WHERE id = $1`, [approvedCctv])).toMatch(/kind is immutable/);
    });
    skipless('one current approved revision per project and system', async () => {
      const m = await refused(`INSERT INTO public.aura_quality_itps (id, tenant_id, project_id, reference, title, status, points, kind, system, revision, created_by, submitted_by, approved_by, approved_at)
        VALUES ($1,$2,$3,'DUP','x','approved','[]'::jsonb,'system_commissioning','cctv',2,'qa-1','qa-1','qa-2',now())`, [newId(), TENANT, P1]);
      expect(m).toMatch(/uq_aura_itp_system_current/);
    });
    skipless('supersession is the only way an approved revision gives way', async () => {
      const older = newId();
      await systemItp(older, { system: 'intercom' });
      expect(await refused(`UPDATE public.aura_quality_itps SET status = 'draft' WHERE id = $1`, [older])).toMatch(/can only be superseded/);
      await q(`UPDATE public.aura_quality_itps SET status = 'superseded', superseded_by = $2, superseded_at = now() WHERE id = $1`, [older, newId()]);
      expect(await refused(`UPDATE public.aura_quality_itps SET status = 'approved' WHERE id = $1`, [older])).toMatch(/superseded ITP revision is immutable/);
    });
    skipless('an installation-inspection plan never carries a system', async () => {
      expect(await refused(`UPDATE public.aura_quality_itps SET system = 'cctv' WHERE id = $1`, [installation])).toMatch(/aura_itp_kind_shape/);
    });
  });

  describe('binding a commissioning record', () => {
    skipless('binds the current approved revision of its own project and system', async () => {
      const id = await record(bind(approvedCctv));
      const row = (await q(`SELECT itp_id, itp_revision FROM public.aura_commissioning_records WHERE id = $1`, [id])).rows[0];
      expect(row).toMatchObject({ itp_id: approvedCctv, itp_revision: 1 });
    });
    skipless('refuses another project, another system, an unapproved revision and an installation plan', async () => {
      expect(await refused(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, itp_id, itp_revision, itp_bound_by, itp_bound_at)
        VALUES ($1,$2,$3,'X1','x','cctv',$4,1,'tc-1',now())`, [newId(), TENANT, P2, approvedCctv])).toMatch(/different project/);
      expect(await refused(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, itp_id, itp_revision, itp_bound_by, itp_bound_at)
        VALUES ($1,$2,$3,'X2','x','access_control',$4,1,'tc-1',now())`, [newId(), TENANT, P1, approvedCctv])).toMatch(/different system/);
      expect(await refused(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, itp_id, itp_revision, itp_bound_by, itp_bound_at)
        VALUES ($1,$2,$3,'X3','x','access_control',$4,1,'tc-1',now())`, [newId(), TENANT, P1, draftAcs])).toMatch(/only the current approved ITP revision can be bound/);
      expect(await refused(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, itp_id, itp_revision, itp_bound_by, itp_bound_at)
        VALUES ($1,$2,$3,'X4','x','cctv',$4,1,'tc-1',now())`, [newId(), TENANT, P1, installation])).toMatch(/installation-inspection ITP is not allowed/);
    });
    skipless('a bound record stays on its revision, system and project', async () => {
      const id = await record(bind(approvedCctv));
      expect(await refused(`UPDATE public.aura_commissioning_records SET itp_id = $2 WHERE id = $1`, [id, approvedCctvP2])).toMatch(/immutable once bound/);
      expect(await refused(`UPDATE public.aura_commissioning_records SET system = 'access_control' WHERE id = $1`, [id])).toMatch(/system and project are immutable/);
    });
  });

  describe('test points on a bound record come from the revision', () => {
    skipless('refuses a hand-typed point, and a point claiming another revision', async () => {
      const id = await record(bind(approvedCctv));
      expect(await refused(`INSERT INTO public.aura_commissioning_test_items (id, tenant_id, commissioning_id, project_id, point_no, description) VALUES ($1,$2,$3,$4,'9','Works')`,
        [newId(), TENANT, id, P1])).toMatch(/hand-typed test point is not allowed/);
      expect(await refused(`INSERT INTO public.aura_commissioning_test_items (id, tenant_id, commissioning_id, project_id, point_no, description, origin, itp_id, itp_point_code, mandatory)
        VALUES ($1,$2,$3,$4,'CCTV-01','x','itp',$5,'CCTV-01',true)`, [newId(), TENANT, id, P1, approvedCctvP2])).toMatch(/different revision/);
    });
    skipless('an approved point is immutable; its execution is not', async () => {
      const id = await record(bind(approvedCctv));
      const p = await itpPoint(id, approvedCctv, 'CCTV-01', true);
      expect(await refused(`UPDATE public.aura_commissioning_test_items SET expected = 'looks fine' WHERE id = $1`, [p])).toMatch(/approved test point is immutable/);
      expect(await refused(`UPDATE public.aura_commissioning_test_items SET mandatory = false WHERE id = $1`, [p])).toMatch(/approved test point is immutable/);
      await q(`UPDATE public.aura_commissioning_test_items SET result = 'pass', actual = 'as specified' WHERE id = $1`, [p]);
    });
    skipless('an UNBOUND record may still hold hand-typed points — they just never commission it', async () => {
      const id = await record({});
      await point(id, { point_no: '1', description: 'Works', expected: 'It works', result: 'pass' });
      expect(await refused(`UPDATE public.aura_commissioning_records SET status = 'commissioned' WHERE id = $1`, [id])).toMatch(/only a system bound to an approved ITP revision can be commissioned/);
    });
  });

  describe('the PASS rule', () => {
    skipless('refuses while a mandatory point is unexecuted, a point is failing, or a defect is open — then commissions', async () => {
      const id = await record(bind(approvedCctv));
      const p1 = await itpPoint(id, approvedCctv, 'CCTV-01', true, 'pass');
      const p2 = await itpPoint(id, approvedCctv, 'CCTV-02', true, 'pending');
      await itpPoint(id, approvedCctv, 'CCTV-03', false, 'pending');
      const commission = `UPDATE public.aura_commissioning_records SET status = 'commissioned', commissioned_by = 'tc-1', witnessed_by = 'Consultant' WHERE id = $1`;
      expect(await refused(commission, [id])).toMatch(/mandatory point of its approved revision has not passed/);
      await q(`UPDATE public.aura_commissioning_test_items SET result = 'fail' WHERE id = $1`, [p2]);
      expect(await refused(commission, [id])).toMatch(/a test point is failing/);
      const punch = newId();
      await q(`INSERT INTO public.aura_commissioning_punch_items (id, tenant_id, commissioning_id, project_id, description, status, test_item_id) VALUES ($1,$2,$3,$4,'Retention 7 days','open',$5)`, [punch, TENANT, id, P1, p2]);
      await q(`UPDATE public.aura_commissioning_test_items SET result = 'pass' WHERE id = $1`, [p2]);
      expect(await refused(commission, [id])).toMatch(/a defect is still open/);
      await q(`UPDATE public.aura_commissioning_punch_items SET status = 'closed', closed_by = 'tc-1', closed_at = now() WHERE id = $1`, [punch]);
      // The non-mandatory point is still pending — and does not block.
      await q(commission, [id]);
      expect((await q(`SELECT status FROM public.aura_commissioning_records WHERE id = $1`, [id])).rows[0].status).toBe('commissioned');
      void p1;
    });
    skipless('a record cannot be written commissioned', async () => {
      expect(await refused(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, status) VALUES ($1,$2,$3,'CW','x','cctv','commissioned')`, [newId(), TENANT, P1]))
        .toMatch(/cannot be written commissioned/);
    });
    skipless('an already-commissioned record from before 0388 is never re-judged', async (ctx) => {
      if (!admin) { ctx.skip(); return; }
      const legacy = newId();
      const client = await admin.connect();
      try {
        await client.query(`SET session_replication_role = replica`);
        await client.query(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, status, commissioned_by, witnessed_by)
          VALUES ($1,$2,$3,'LEGACY','Legacy CCTV','cctv','commissioned','tc-0','Consultant')`, [legacy, TENANT, P1]);
        await client.query(`SET session_replication_role = origin`);
      } finally { client.release(); }
      await q(`UPDATE public.aura_commissioning_records SET remarks = 'certificate filed' WHERE id = $1`, [legacy]);
      expect((await q(`SELECT status, itp_id FROM public.aura_commissioning_records WHERE id = $1`, [legacy])).rows[0]).toMatchObject({ status: 'commissioned', itp_id: null });
    });
  });

  skipless('the lookups answer even where row-level security would hide the revision', async () => {
    // A tenant context that cannot see the revision must still be REFUSED for binding it, never allowed.
    const other = new Pool({ connectionString: envValue('DATABASE_URL')!, max: 1 });
    other.on('connect', (c) => { void c.query(`SELECT set_config('app.current_tenant_id', 'somebody-else', false)`); });
    try {
      const m = await other.query(`INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, itp_id, itp_revision, itp_bound_by, itp_bound_at)
        VALUES ($1,'somebody-else',$2,'RLS','x','cctv',$3,1,'tc-1',now())`, [newId(), P1, approvedCctv]).then(() => 'accepted', (e: Error) => e.message);
      expect(m).toMatch(/different tenant/);
    } finally { await other.end(); }
  });

  /**
   * THROUGH THE REAL STORE. The adapter saves with INSERT … ON CONFLICT (id) DO UPDATE, and
   * PostgreSQL fires BEFORE INSERT for the proposed row before it finds the conflict. Hand-written
   * UPDATEs above cannot see that; these go through `PostgresCommissioningStore`, the path the
   * application takes — which is where the first cut of these guards judged every save a new row.
   */
  describe('through the real store — an upsert is not a new row', () => {
    const now = () => new Date().toISOString();

    skipless('a record pinned to a revision since superseded keeps executing, retests, and commissions', async () => {
      const store = new PostgresCommissioningStore(pool!);
      const r1 = newId();
      const r2 = newId();
      await systemItp(r1, { system: 'nurse_call' });

      let rec = makeCommissioningRecord({ tenantId: TENANT, projectId: P1, code: `UP-${Math.random().toString(36).slice(2, 7)}`, title: 'Nurse call — Ward 3', system: 'nurse_call' });
      await store.save(rec);
      // Typed and failed BEFORE the checklist existed — history that binding does not erase.
      const typed = makeTestItem({ tenantId: TENANT, commissioningId: rec.id, projectId: P1, pointNo: 'T-1', description: 'Typed before binding' });
      await store.saveTestItem(typed);
      await store.saveTestItem({ ...typed, result: 'fail', testedAt: now() });

      rec = { ...rec, itpId: r1, itpRevision: 1, itpBoundBy: 'tc-1', itpBoundAt: now() };
      await store.save(rec);
      const points = POINTS_V1.map((p) => makeTestItem({
        tenantId: TENANT, commissioningId: rec.id, projectId: P1, pointNo: p.code, description: p.activity, expected: p.acceptanceCriteria,
        checklist: { itpId: r1, code: p.code, mandatory: p.mandatory },
      }));
      for (const p of points) await store.saveTestItem(p);

      // Quality approves revision 2 — revision 1 is superseded under the record executing it.
      await systemItp(r2, { system: 'nurse_call', revision: 2, status: 'submitted', approved_by: null, approved_at: null });
      await q(`UPDATE public.aura_quality_itps SET status = 'superseded', superseded_by = $2, superseded_at = now() WHERE id = $1`, [r1, r2]);
      await q(`UPDATE public.aura_quality_itps SET status = 'approved', approved_by = 'qa-2', approved_at = now() WHERE id = $1`, [r2]);

      await store.save({ ...rec, remarks: 'still executing revision 1' });
      // A retest of the typed point is an upsert of an existing point — not a new hand-typed one.
      await store.saveTestItem({ ...typed, result: 'pass', testedAt: now() });
      for (const p of points.filter((x) => x.mandatory)) await store.saveTestItem({ ...p, result: 'pass', testedAt: now() });

      await store.save({ ...rec, status: 'commissioned', commissionedBy: 'Engineer', witnessedBy: 'Consultant', commissionedAt: now() });
      expect((await q(`SELECT status, itp_id, itp_revision FROM public.aura_commissioning_records WHERE id = $1`, [rec.id])).rows[0])
        .toMatchObject({ status: 'commissioned', itp_id: r1, itp_revision: 1 });
    });

    skipless('still refuses through the store everything it refuses by hand', async () => {
      const store = new PostgresCommissioningStore(pool!);
      const fresh = makeCommissioningRecord({ tenantId: TENANT, projectId: P1, code: `UP-${Math.random().toString(36).slice(2, 7)}`, title: 'CCTV', system: 'cctv' });
      await expect(store.save({ ...fresh, status: 'commissioned', commissionedBy: 'E', witnessedBy: 'C', commissionedAt: now() }))
        .rejects.toThrow(/cannot be written commissioned/);

      const rec = { ...fresh, itpId: approvedCctv, itpRevision: 1, itpBoundBy: 'tc-1', itpBoundAt: now() };
      await store.save(rec);
      const mandatory = makeTestItem({ tenantId: TENANT, commissioningId: rec.id, projectId: P1, pointNo: 'CCTV-01', description: 'x', checklist: { itpId: approvedCctv, code: 'CCTV-01', mandatory: true } });
      await store.saveTestItem(mandatory);
      await expect(store.saveTestItem(makeTestItem({ tenantId: TENANT, commissioningId: rec.id, projectId: P1, pointNo: 'X-1', description: 'hand-typed' })))
        .rejects.toThrow(/hand-typed test point is not allowed/);
      await expect(store.save({ ...rec, status: 'commissioned', commissionedBy: 'E', witnessedBy: 'C', commissionedAt: now() }))
        .rejects.toThrow(/mandatory point of its approved revision has not passed/);
      await expect(store.save({ ...rec, itpId: approvedCctvP2 })).rejects.toThrow(/immutable once bound/);
    });
  });
});
