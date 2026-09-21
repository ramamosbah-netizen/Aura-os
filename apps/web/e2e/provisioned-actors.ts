import type { APIRequestContext } from '@playwright/test';

/**
 * WHICH TIER AM I RUNNING IN, AND CAN THE ACTORS THIS SPEC NEEDS EXIST HERE?
 *
 * Several specs drive a NON-ADMIN identity — `u-e2e-viewer`, `u-e2e-storekeeper`, `u-e2e-buyer`
 * and friends. Those actors are real rows: CI's TIER-3 job and `provision-local-db.mjs` write
 * them into `aura_access_roles`/`aura_access_grants`, and `AccessService` hydrates grants from
 * Postgres at boot. TIER-2 has NO DATABASE_URL, so it cannot have them:
 *
 *   - grants hydrate only from Postgres, so there is nowhere to put the roles, and
 *   - the one lever that would give the account a password, `AUTH_DEV_ADMIN_USER`, ALSO hands it
 *     `r-admin` in an in-memory boot (AccessService.seedDevAdminGrant). An actor added that way
 *     would sign in and be an administrator, which destroys the very property these specs prove.
 *
 * So in TIER-2 the login answers 401 and the spec dies on `must be able to mint a token` — a
 * failure that reads as a product bug and is not one. provision-local-db.mjs already warns about
 * this in its own runbook: leaving the actors out "does not produce a clean skip — it produces
 * FAILURES THAT LOOK LIKE PRODUCT BUGS." Thirteen of TIER-2's twenty-six failures were this.
 *
 * ## The gate asks the API, not the environment
 *
 * It would be easier to read an env var. It would also be wrong: a TIER-3 run that forgot to set
 * it would SKIP, and a skip is indistinguishable from a pass in a summary line. The question that
 * actually decides whether the actor can exist is whether the API is backed by a real schema, and
 * the API answers that itself — `/health` reports `schema.applied` as a number against a migrated
 * database and `null` on an in-memory boot.
 *
 * That keeps the honesty in the right direction:
 *
 *   in-memory API   → skip, with the reason stated
 *   database-backed → DO NOT SKIP. If the actor still cannot sign in, that is a genuine failure
 *                     about provisioning and it must stay loud.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

let cached: string | null | undefined;

/**
 * Returns a skip reason when this tier cannot hold database-provisioned actors, or `null` when it
 * can and the spec must run for real.
 *
 * Cached for the run: every spec asks, and the answer cannot change under a single API process.
 */
export async function provisionedActorsUnavailable(request: APIRequestContext): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await request.get(`${API}/api/v1/health`);
    if (!res.ok()) {
      // Unreachable is not the same as in-memory, and guessing either way here would be worse than
      // letting the spec run and fail against a real symptom.
      cached = null;
      return cached;
    }
    const body = (await res.json()) as { schema?: { applied?: number | null } };
    const applied = body.schema?.applied;
    cached =
      applied == null
        ? 'this tier runs the API in memory, where a non-admin provisioned actor cannot exist ' +
          '(grants hydrate only from Postgres, and AUTH_DEV_ADMIN_USER would make it an admin). ' +
          'The database-backed tier runs this for real.'
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test-only: forget the cached answer, so a unit test can exercise both branches. */
export function resetProvisionedActorsCache(): void {
  cached = undefined;
}
