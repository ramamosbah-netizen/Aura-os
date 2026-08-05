import type { Id } from '@aura/shared';

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
