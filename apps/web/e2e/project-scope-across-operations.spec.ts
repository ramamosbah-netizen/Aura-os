import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * Project scope holds across the whole delivery surface, on routes that name a record and nothing
 * else.
 *
 * This is the generalisation of the drawings slice, and it is asserted per module rather than
 * assumed from one: `ProjectResolverRegistry` is a single seam, but a resolver is registered per
 * AGGREGATE and each registration is its own chance to be wrong — an entity name that does not
 * match what the guard derives from the route resolves nothing and fails silently back to org-wide
 * authorisation. A passing module here says that module's registration actually reaches its routes.
 *
 * ## The request shape being tested
 *
 * `GET engineering/drawings/{id}` — no `projectId` anywhere in it. Before the resolver seam the
 * guard had nothing to scope by, so the target carried no resource and a project-scoped grant could
 * not match: a project MEMBER was refused their own project's records while every org-grant holder
 * could read all of them. Now the project comes from the RECORD, which is also why the URL cannot
 * be used to claim a different one.
 *
 * ## Roles are part of the answer, not noise
 *
 * A Site Engineer holds no commissioning permission, so a Site Engineer is refused a commissioning
 * record on their OWN project — correctly, and it is not a scoping failure. This spec therefore
 * uses the role that actually covers the modules it asserts, and says so, because "403" alone does
 * not distinguish "wrong project" from "wrong job".
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const MEMBER = 'u-e2e-viewer';

/** QA/QC holds quality, commissioning and engineering reads — the three surfaces asserted below. */
const MEMBER_ROLE = 'r-qa-qc';

async function signIn(request: APIRequestContext, username: string): Promise<string | null> {
  const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
  if (!password) return null;
  const res = await request.post(`${V1}/auth/login`, { data: { username, password } });
  return res.ok() ? (((await res.json()) as { token?: string }).token ?? null) : null;
}

test.describe('project scope across operations', () => {
  test.setTimeout(240_000);

  test('a record addressed by its own id is scoped to the project the record belongs to', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run — every assertion here would pass vacuously');
    const memberToken = await signIn(request, MEMBER);
    test.skip(!memberToken, `needs ${MEMBER} and E2E_PASSWORD`);

    const H = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);

    const post = async <T>(url: string, data: unknown): Promise<T> => {
      const res = await request.post(`${V1}${url}`, { headers: H, data });
      expect(res.ok(), `${url} must accept the seed — ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    };

    const a = await post<{ id: string }>('/projects/projects', { title: `Ops ${run} A`, code: `OP-${run}-A` });
    const b = await post<{ id: string }>('/projects/projects', { title: `Ops ${run} B`, code: `OP-${run}-B` });

    // Membership of A only. B is the control: same records, same role, different project.
    await post(`/projects/${a.id}/members`, { userId: MEMBER, roleId: MEMBER_ROLE });

    /** One aggregate per module, seeded into both projects, then read BY ID with no project. */
    const cases = [
      {
        module: 'engineering',
        read: (id: string) => `/engineering/drawings/${id}`,
        seed: (projectId: string, s: string) =>
          post<{ id: string }>('/engineering/drawings', { projectId, code: `OD-${run}-${s}`, title: 'seed', revision: '0' }),
      },
      {
        module: 'quality',
        read: (id: string) => `/quality/ncrs/${id}`,
        seed: (projectId: string, s: string) =>
          post<{ id: string }>('/quality/ncrs', { projectId, ncrNumber: `ON-${run}-${s}`, description: 'seed', severity: 'minor', system: 'cctv' }),
      },
      {
        module: 'commissioning',
        read: (id: string) => `/commissioning/records/${id}`,
        seed: (projectId: string, s: string) =>
          post<{ id: string }>('/commissioning/records', { projectId, code: `OC-${run}-${s}`, title: 'seed', system: 'cctv' }),
      },
      {
        module: 'handover',
        read: (id: string) => `/commissioning/handovers/${id}`,
        seed: (projectId: string, s: string) =>
          post<{ id: string }>('/commissioning/handovers', { projectId, code: `OH-${run}-${s}`, title: 'seed' }),
      },
    ] as const;

    const status = async (url: string, token: string) =>
      (await request.get(`${V1}${url}`, { headers: { Authorization: `Bearer ${token}` } })).status();

    for (const c of cases) {
      const mine = await c.seed(a.id, 'A');
      const theirs = await c.seed(b.id, 'B');

      // The whole point: no project in the request, and the member still gets in — because the
      // guard resolved the project from the record. This was a 403 before the seam existed.
      expect(
        await status(c.read(mine.id), memberToken!),
        `${c.module}: a member must reach their own project's record by id alone`,
      ).toBe(200);

      expect(
        await status(c.read(theirs.id), memberToken!),
        `${c.module}: and must not reach another project's, by the same route shape`,
      ).toBe(403);

      // The same request the member was refused, allowed for an org grant — so the 403 above is
      // known to be the missing project grant and not a broken route or a missing permission.
      expect(
        await status(c.read(theirs.id), admin!.replace('Bearer ', '')),
        `${c.module}: an org-wide grant is untouched`,
      ).toBe(200);
    }
  });
});
