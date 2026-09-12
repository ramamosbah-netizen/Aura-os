/**
 * Open a session that is allowed to see ACROSS tenants — or fail loudly trying (TC-GATE-21).
 *
 * THE PROBLEM THIS EXISTS FOR.
 *
 * Migrations and operator scripts connect as the OWNING role and act on every tenant at once: a
 * backfill, a retention sweep, an orphan scan. None of them bind `app.current_tenant_id`, because
 * none of them is about one tenant.
 *
 * Every tenant-scoped business table in this schema is `ENABLE` **and `FORCE` ROW LEVEL SECURITY`,
 * and FORCE is precisely the flag that extends RLS TO THE TABLE'S OWNER. So with no tenant bound,
 * the policy matches nothing and the owner sees an empty table. PostgreSQL does not complain about
 * that — it is not an error, it is a filter:
 *
 *     rows visible to a NOBYPASSRLS role with no tenant bound: 0
 *     rows a backfill UPDATE would touch:                      0
 *     error raised:                                            none
 *
 * The script prints "done". The data is untouched. That is the worst possible outcome for a
 * migration, and it is invisible on any deployment that happens to run migrations as a superuser —
 * which is every one we can see: the local disposable database and the CI service container both
 * make the owner a superuser, so neither could ever have caught it.
 *
 * THE MECHANISM.
 *
 * `SET row_security = off` tells PostgreSQL to RAISE rather than filter: "query would be affected by
 * row-level security policy for table X". And it is defined to have **no effect on roles that bypass
 * every policy** — superusers and `BYPASSRLS` roles — so this is a no-op exactly where the work was
 * already correct, and a hard stop exactly where it was silently doing nothing.
 *
 * Which is the whole contract: a cross-tenant write either happens or fails. It never reports
 * success over an empty result.
 *
 * NOT FOR `rls-isolation-test.mjs` or `rls-fitness.mjs`. The first exists to observe RLS filtering
 * and must keep seeing it; the second reads catalogue tables, which carry no policy.
 */

/**
 * @param {import('pg').Client | import('pg').Pool} client  an already-connected client
 * @param {string} label  what this session is for, used in the log line
 * @returns {Promise<{ name: string, superuser: boolean, bypassrls: boolean, privileged: boolean }>}
 */
export async function openCrossTenantSession(client, label) {
  const { rows } = await client.query(
    `select current_user as name,
            coalesce(rolsuper, false)     as rolsuper,
            coalesce(rolbypassrls, false) as rolbypassrls
       from pg_roles where rolname = current_user`,
  );
  const row = rows[0] ?? { name: 'unknown', rolsuper: false, rolbypassrls: false };
  const superuser = row.rolsuper === true;
  const bypassrls = row.rolbypassrls === true;
  const privileged = superuser || bypassrls;

  // Session level, not `SET LOCAL`: callers that run several transactions (migrate.mjs) and callers
  // that run none (the scan and sweep scripts) both need it, and a session-level SET made outside a
  // transaction survives a ROLLBACK.
  await client.query('SET row_security = off');

  // The role's posture is QUERIED, never inferred from the connection string. The runbook's claim
  // that "the owning role bypasses RLS" was written when FORCE was set on none of the tables; a
  // deployment is entitled to have moved on, and this is the line that would say so.
  console.log(
    privileged
      ? `→ ${label}: role "${row.name}" ${superuser ? 'is a superuser' : 'has BYPASSRLS'} — RLS does not apply, cross-tenant work proceeds.`
      : `→ ${label}: role "${row.name}" is NOT superuser and NOT BYPASSRLS. RLS applies to it, FORCE included.\n` +
        `  Any statement that would be silently filtered will now RAISE instead of reporting success over 0 rows.\n` +
        `  If that happens, grant the migration role BYPASSRLS — do not bind a tenant to make it "work".`,
  );

  return { name: row.name, superuser, bypassrls, privileged };
}
