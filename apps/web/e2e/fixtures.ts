import type { APIRequestContext } from '@playwright/test';

/**
 * A REAL project id for specs that need one to hang records off.
 *
 * The specs used to seed with a made-up string (`projectId: 'e2e-proj'`). Against the in-memory
 * adapters that is simply a map key and works; against PostgreSQL the column is `uuid` and the
 * insert is rejected with `400 invalid input syntax for type uuid: "e2e-proj"`. Eleven specs failed
 * on seeding alone, which reads exactly like a product regression — and it meant the browser suite
 * had never once exercised the database path.
 *
 * Asking the API to create a project and using the id it returns is both backend-agnostic and
 * closer to what a user actually does, which is why it is preferred over generating a UUID locally:
 * a random UUID satisfies the column type while still pointing at a project that does not exist.
 *
 * Cached per worker — the suite runs single-worker, and one fixture project per run is plenty.
 */
let cached: string | null = null;

export async function projectFixtureId(request: APIRequestContext, baseURL?: string): Promise<string> {
  if (cached) return cached;
  const res = await request.post(`${baseURL ?? ''}/api/projects/projects`, {
    data: {
      title: 'E2E Fixture Project',
      reference: `PX-E2E-${Date.now().toString().slice(-6)}`,
      status: 'active',
      value: 250_000,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `e2e fixtures: could not create the fixture project (${res.status()} from ${baseURL ?? ''}/api/projects/projects). ` +
        'Every spec that files a record against a project needs one to exist.',
    );
  }
  cached = ((await res.json()) as { id: string }).id;
  return cached;
}
