// RLS posture (P0-2) — a pure decision over the runtime DB connection role.
//
// Postgres row-level security is the DB-level tenant-isolation net, but it is INERT when the runtime
// connects as a superuser or BYPASSRLS role: the `tenant_id = current_tenant_id()` policies simply
// never apply, so isolation rests on app-level `WHERE tenant_id` alone. The least-privilege
// `aura_app` role (migration 0163: NOSUPERUSER/NOBYPASSRLS) is what makes FORCE RLS take effect.
// The API verifies this at boot and fails closed in production. See docs/runbooks/rls-tenant-isolation.md.

export interface RlsPostureInput {
  /** `current_user` of the live DB connection. */
  role: string;
  /** rolsuper OR rolbypassrls — true means RLS policies do not apply to this role. */
  bypasses: boolean;
  isProduction: boolean;
  /** Explicit ALLOW_RLS_BYPASS override (deployments isolating at another layer). */
  allowBypass: boolean;
}

export interface RlsPostureDecision {
  /** `ok` = enforced; `warn` = inert but tolerated (dev / override); `fatal` = refuse to boot. */
  level: 'ok' | 'warn' | 'fatal';
  message: string;
}

const inertBase = (role: string): string =>
  `DB connection role "${role}" bypasses row-level security (superuser/BYPASSRLS) — RLS policies are ` +
  'INERT and tenant isolation is app-code-only. Provision the least-privilege aura_app role ' +
  '(see docs/runbooks/rls-tenant-isolation.md).';

/** Decide how to react to the connection role's RLS posture. Pure — no I/O, no process side effects. */
export function evaluateRlsPosture(input: RlsPostureInput): RlsPostureDecision {
  if (!input.bypasses) {
    return { level: 'ok', message: `DB role "${input.role}" is non-BYPASSRLS — FORCE RLS tenant policies are active.` };
  }
  if (input.isProduction && !input.allowBypass) {
    return {
      level: 'fatal',
      message: `${inertBase(input.role)} Refusing to boot — connect as aura_app, or set ALLOW_RLS_BYPASS=true to override (NOT recommended).`,
    };
  }
  return { level: 'warn', message: inertBase(input.role) };
}
