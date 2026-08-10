import type { Id } from '../domain/id';

/**
 * Assert that a record fetched **by id alone** belongs to the tenant making the request.
 *
 * Several finance stores expose `get(id)` with no tenant parameter, and neither implementation
 * adds one — the Postgres query is literally `WHERE id = $1`. Row-level security is meant to be
 * the net underneath that, but it is INERT in the running deployment (the app connects as the
 * database owner, so no policy applies — see the readiness audit's P0-2 / G-03). That leaves these
 * reads with no tenant boundary at all: a caller holding an id from another tenant reads, and in
 * the mutation paths WRITES, that tenant's record.
 *
 * Ids are UUIDs so this is not guessable, but ids travel — in URLs, exports, logs and API
 * responses — and "hard to guess" is not an isolation boundary. This is exactly the failure the
 * readiness audit predicted: "a future missing WHERE tenant_id would leak cross-tenant data
 * undetected."
 *
 * Phrased "not found" deliberately: a caller from the wrong tenant must not be able to tell the
 * difference between a record that does not exist and one they may not see. It also maps to 404
 * through the error taxonomy, which is the right answer to give them.
 */
export function assertSameTenant<T extends { tenantId: Id }>(
  record: T | null | undefined,
  tenantId: Id | null | undefined,
  label: string,
  id: Id,
): T {
  if (!record) throw new Error(`${label} ${id} not found`);
  // No bound tenant (system/boot paths, in-memory tests) → nothing to check against.
  if (tenantId && record.tenantId !== tenantId) throw new Error(`${label} ${id} not found`);
  return record;
}

/**
 * Read-side companion to {@link assertSameTenant}. Returns the record when it belongs to the
 * tenant, and `null` when it is missing OR belongs to another tenant — so a plain getter keeps
 * its `T | null` contract (callers that already handle "missing" as 404 keep working) while
 * still refusing to hand a caller another tenant's row. A null bound tenant passes the record
 * through unchanged, for the same system/boot reasons as {@link assertSameTenant}.
 *
 * Use this on getters; use {@link assertSameTenant} on the fetch that precedes a mutation.
 */
export function sameTenantOrNull<T extends { tenantId: Id }>(
  record: T | null | undefined,
  tenantId: Id | null | undefined,
): T | null {
  if (!record) return null;
  if (tenantId && record.tenantId !== tenantId) return null;
  return record;
}
