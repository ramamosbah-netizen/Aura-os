import type { APIRequestContext } from '@playwright/test';

/**
 * A short identifier unique to this run of the suite.
 *
 * Every record a spec creates should carry it, for two reasons that have both already cost time:
 *
 *   - Two runs against the same database must not collide. Dates and references derived from a
 *     scenario name are deliberately deterministic so a failure reproduces, but "deterministic"
 *     and "unique" are opposites: the daily-report table refuses a second report for the same
 *     project on the same day, so a second run would fail on seeding alone.
 *   - Rows must be attributable afterwards. Deciding whether a row came from a test or from a
 *     person is guesswork once a title reads "Site report" and the timestamps overlap.
 *
 * Set once in global setup and inherited by workers. The fallback matters for `--ui` and for a
 * single spec run through the IDE, where global setup may not have run.
 */
let fallback: string | null = null;

export function runId(): string {
  const fromSetup = process.env.E2E_RUN_ID;
  if (fromSetup) return fromSetup;
  // Memoised deliberately. Deriving it from the clock on every call would make two `scoped()` calls
  // in one spec return two different names, and the spec would then look for a record it never
  // created.
  fallback ??= `local-${Date.now().toString(36).slice(-6)}`;
  return fallback;
}

/** A human-readable name that is unique to this run — `scoped('Delivery Workspace')`. */
export function scoped(label: string): string {
  return `${label} ${runId()}`;
}

/**
 * Create a project and return its id.
 *
 * Specs used to seed with a made-up string (`projectId: 'e2e-proj'`). Against the in-memory
 * adapters that is simply a map key and works; against PostgreSQL the column is `uuid` and the
 * insert is rejected with `400 invalid input syntax for type uuid: "e2e-proj"`. Eleven specs failed
 * on seeding alone, which reads exactly like a product regression — and it meant the browser suite
 * had never once exercised the database path.
 *
 * Asking the API to create a project and using the id it returns is both backend-agnostic and
 * closer to what a user actually does, which is why it is preferred over generating a UUID locally:
 * a random UUID satisfies the column type while still pointing at a project that does not exist.
 */
let sequence = 0;

export async function createProject(
  request: APIRequestContext,
  label: string,
  baseURL?: string,
): Promise<string> {
  sequence += 1;
  const res = await request.post(`${baseURL ?? ''}/api/projects/projects`, {
    data: {
      title: scoped(label),
      // Distinct per project but still carrying the run — a reference is what a person reads in a
      // register, and three rows sharing one is confusing to anyone looking at the data later.
      reference: `PX-${runId()}-${sequence}`,
      status: 'active',
      value: 250_000,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `e2e fixtures: could not create the project '${label}' (${res.status()} from ` +
        `${baseURL ?? ''}/api/projects/projects). Every spec that files a record against a project ` +
        'needs one to exist.',
    );
  }
  return ((await res.json()) as { id: string }).id;
}

/**
 * A shared project for specs that need *a* project to hang records off and do not care which.
 *
 * Cached per worker. A spec that writes something the project itself then constrains — a daily
 * report, whose uniqueness is per project per day — must call `createProject` and own one instead,
 * or it will collide with whichever other spec had the same idea.
 */
let cached: string | null = null;

export async function projectFixtureId(request: APIRequestContext, baseURL?: string): Promise<string> {
  if (cached) return cached;
  cached = await createProject(request, 'E2E Fixture Project', baseURL);
  return cached;
}
