// AURA OS — RLS cross-tenant isolation integration test (Roadmap R1 / G-P0-1).
// Proves that under a NON-BYPASSRLS role the canonical tenant policy actually denies
// cross-tenant access. Creates an ephemeral probe role + test table modelled exactly like a
// business table (tenant_id + ENABLE/FORCE RLS + `tenant_id = current_tenant_id()` policy),
// then asserts SELECT/INSERT/UPDATE/DELETE isolation, fail-closed on missing context, and
// no context leak across sequential "requests". Cleans up in finally. Runs in CI's Postgres
// job (the default role there is a superuser, so it can mint the restricted probe role).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};
const DATABASE_URL = envOrFile('DATABASE_URL');
if (!DATABASE_URL) { console.error('✗ DATABASE_URL not set — cannot run RLS isolation test.'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(DATABASE_URL) || /[?&]sslmode=disable/.test(DATABASE_URL);
const ssl = sslOff ? false : { rejectUnauthorized: false };

const TABLE = 'aura_rls_probe_' + randomUUID().slice(0, 8).replace(/-/g, '');
// A second probe modelled on aura_workflow_definitions: tenant_id '' = a GLOBAL template shared
// by all tenants (migration 0164 policy). Proves global rows stay visible under the enforced role
// while per-tenant rows stay isolated.
const GTABLE = 'aura_rls_gprobe_' + randomUUID().slice(0, 8).replace(/-/g, '');
const ROLE = 'aura_rls_probe_' + randomUUID().slice(0, 8).replace(/-/g, '');
const PASS = 'probe_' + randomUUID();
const A = 'rls-tenant-a', B = 'rls-tenant-b';
const idA = randomUUID(), idB = randomUUID();

let passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); passed++; console.log('  ✓ ' + msg); }

async function main() {
  const admin = new pg.Client({ connectionString: DATABASE_URL, ssl });
  await admin.connect();

  // Probe role connection string: same target, restricted user.
  const u = new URL(DATABASE_URL);
  u.username = ROLE; u.password = PASS;
  let probe;

  try {
    // --- setup as admin ---
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.query(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${PASS}'`);
    await admin.query(`CREATE TABLE public.${TABLE} (id uuid primary key, tenant_id text not null, note text)`);
    await admin.query(`ALTER TABLE public.${TABLE} ENABLE ROW LEVEL SECURITY`);
    await admin.query(`ALTER TABLE public.${TABLE} FORCE ROW LEVEL SECURITY`);
    await admin.query(
      `CREATE POLICY tenant_isolation_policy ON public.${TABLE} FOR ALL ` +
      `USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL) ` +
      `WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${TABLE} TO ${ROLE}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    // seed one row per tenant (admin is BYPASSRLS/owner, so inserts are unrestricted)
    await admin.query(`INSERT INTO public.${TABLE}(id,tenant_id,note) VALUES ($1,$2,'a'),($3,$4,'b')`, [idA, A, idB, B]);

    // --- global-template probe (models aura_workflow_definitions + migration 0164 policy) ---
    await admin.query(`CREATE TABLE public.${GTABLE} (id uuid primary key, tenant_id text not null default '', note text)`);
    await admin.query(`ALTER TABLE public.${GTABLE} ENABLE ROW LEVEL SECURITY`);
    await admin.query(`ALTER TABLE public.${GTABLE} FORCE ROW LEVEL SECURITY`);
    await admin.query(
      `CREATE POLICY workflow_definitions_isolation_policy ON public.${GTABLE} FOR ALL ` +
      `USING (tenant_id = public.current_tenant_id() OR tenant_id = '') ` +
      `WITH CHECK (tenant_id = public.current_tenant_id() OR tenant_id = '')`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${GTABLE} TO ${ROLE}`);
    // one global template ('') + one tenant-A custom row
    await admin.query(`INSERT INTO public.${GTABLE}(id,tenant_id,note) VALUES ($1,'','global'),($2,$3,'a-custom')`, [randomUUID(), randomUUID(), A]);

    // sanity: the probe role must NOT bypass RLS
    const [{ rolbypassrls, rolsuper }] = (await admin.query(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname=$1`, [ROLE])).rows;
    assert(rolbypassrls === false && rolsuper === false, 'probe role is non-superuser and NOBYPASSRLS');

    // --- act as the restricted probe role ---
    probe = new pg.Client({ connectionString: u.toString(), ssl });
    await probe.connect();
    const setCtx = (t) => probe.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [t]);
    const count = async (sql, p) => Number((await probe.query(sql, p)).rows[0].c);

    await setCtx(A);
    assert(await count(`SELECT count(*)::int c FROM public.${TABLE}`) === 1, 'tenant A sees exactly its own row (SELECT isolation)');
    const seesB = await count(`SELECT count(*)::int c FROM public.${TABLE} WHERE id=$1`, [idB]);
    assert(seesB === 0, "tenant A cannot SELECT tenant B's row");

    const upd = await probe.query(`UPDATE public.${TABLE} SET note='hax' WHERE id=$1`, [idB]);
    assert(upd.rowCount === 0, "tenant A cannot UPDATE tenant B's row (0 rows affected)");

    const del = await probe.query(`DELETE FROM public.${TABLE} WHERE id=$1`, [idB]);
    assert(del.rowCount === 0, "tenant A cannot DELETE tenant B's row (0 rows affected)");

    let insertDenied = false;
    try { await probe.query(`INSERT INTO public.${TABLE}(id,tenant_id,note) VALUES ($1,$2,'x')`, [randomUUID(), B]); }
    catch { insertDenied = true; }
    assert(insertDenied, "tenant A cannot INSERT a row attributed to tenant B (WITH CHECK)");

    const okIns = await probe.query(`INSERT INTO public.${TABLE}(id,tenant_id,note) VALUES ($1,$2,'own')`, [randomUUID(), A]);
    assert(okIns.rowCount === 1, 'tenant A CAN insert its own row');

    // fail-closed: no tenant context → no rows
    await setCtx('');
    assert(await count(`SELECT count(*)::int c FROM public.${TABLE}`) === 0, 'missing tenant context fails closed (0 rows)');

    // no-leak: switching context on the same connection re-scopes cleanly
    await setCtx(B);
    const bOnly = await probe.query(`SELECT tenant_id FROM public.${TABLE}`);
    assert(bOnly.rows.every((r) => r.tenant_id === B), 'after switching to tenant B, only B rows are visible (no leak of A)');

    // --- relay pattern: reusing ONE connection across tenants, per-event context restore ---
    // Models the outbox relay processing events for A then B on one pooled connection: each
    // "event" sets its tenant, writes its row, and must never see or touch the other tenant's row.
    const relayA = randomUUID(), relayB = randomUUID();
    await setCtx(A);
    await probe.query(`INSERT INTO public.${TABLE}(id,tenant_id,note) VALUES ($1,$2,'relayA')`, [relayA, A]);
    await setCtx(B);
    await probe.query(`INSERT INTO public.${TABLE}(id,tenant_id,note) VALUES ($1,$2,'relayB')`, [relayB, B]);
    const bAfterRelay = await count(`SELECT count(*)::int c FROM public.${TABLE} WHERE id=$1`, [relayA]);
    assert(bAfterRelay === 0, "relay pattern: after switching to B, A's just-written row is invisible (per-event isolation, no leak)");
    await setCtx(A);
    const aSeesOwnRelay = await count(`SELECT count(*)::int c FROM public.${TABLE} WHERE id=$1`, [relayA]);
    assert(aSeesOwnRelay === 1, 'relay pattern: A sees its own relay-written row when its context is restored');

    // --- global-template isolation (migration 0164): '' rows shared, per-tenant rows isolated ---
    await setCtx(A);
    const aTemplates = await count(`SELECT count(*)::int c FROM public.${GTABLE}`);
    assert(aTemplates === 2, 'tenant A sees the global template + its own custom definition (2 rows)');
    await setCtx(B);
    const bTemplates = await count(`SELECT count(*)::int c FROM public.${GTABLE}`);
    assert(bTemplates === 1, "tenant B sees ONLY the global template — not tenant A's custom definition");
    // a global ('') template can be registered with NO tenant context (models WorkflowSeeder at boot)
    await setCtx('');
    const okGlobal = await probe.query(`INSERT INTO public.${GTABLE}(id,tenant_id,note) VALUES ($1,'','boot-seeded')`, [randomUUID()]);
    assert(okGlobal.rowCount === 1, "a global ('') template is registrable with no tenant context (boot seeder path)");
    // but a tenant-attributed row still cannot be written without that tenant's context
    let gTenantDenied = false;
    try { await probe.query(`INSERT INTO public.${GTABLE}(id,tenant_id,note) VALUES ($1,$2,'x')`, [randomUUID(), A]); }
    catch { gTenantDenied = true; }
    assert(gTenantDenied, "with no tenant context, a tenant-attributed template write is still denied (fail-closed)");

    console.log(`\n✓ RLS isolation verified — ${passed} assertions passed.`);
  } finally {
    if (probe) await probe.end().catch(() => {});
    await admin.query(`DROP TABLE IF EXISTS public.${GTABLE}`).catch(() => {});
    await admin.query(`DROP TABLE IF EXISTS public.${TABLE}`).catch(() => {});
    // Revoke the role's grants before dropping it, else the schema-usage grant blocks DROP ROLE.
    await admin.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${ROLE}`).catch(() => {});
    await admin.query(`REVOKE USAGE ON SCHEMA public FROM ${ROLE}`).catch(() => {});
    await admin.query(`DROP OWNED BY ${ROLE} CASCADE`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
main().catch((e) => { console.error('✗', e.message); process.exit(1); });
