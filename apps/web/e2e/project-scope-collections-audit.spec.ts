import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * PHASE 2 — collections, aggregates and Reports, audited with auth ON.
 *
 * Phase 1 proved that a record addressed by its own id is scoped to its project. That says nothing
 * about the shapes that return MANY records or a NUMBER derived from many: a list, a workspace
 * projection, a count on a dashboard. An entity endpoint can be perfectly sealed while
 * `GET /quality/ncrs` hands back every project's rows, or while a KPI reads "202 open NCRs" across
 * a tenant the caller can see one project of. Leaking an aggregate is still leaking.
 *
 * So this asserts on the RESPONSE BODY, not on the status code. Each project gets a record with a
 * unique marker in it, and the test asks whether the other project's marker can be obtained. A 200
 * that contains it is the failure; the status alone would not show that.
 *
 * ## Reports is audited, not reasoned about
 *
 * I previously said Reports "is constrained automatically by its sources". That was an inference
 * presented as a result, and it was fair of the user to reject it. Reports (`/operations/reports`)
 * reads seven list endpoints and nothing else — the same seven asserted here, by the same request
 * shapes the page uses. That makes the claim a consequence of measured behaviour rather than of
 * how the page happens to be written.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;
const MEMBER = 'u-e2e-viewer';

async function signIn(request: APIRequestContext, username: string): Promise<string | null> {
  const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
  if (!password) return null;
  const res = await request.post(`${V1}/auth/login`, { data: { username, password } });
  return res.ok() ? (((await res.json()) as { token?: string }).token ?? null) : null;
}

test.describe('project scope — collections and aggregates', () => {
  test.setTimeout(240_000);

  test('no collection or aggregate hands a member another project’s data', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run — every assertion here would pass vacuously');
    const member = await signIn(request, MEMBER);
    test.skip(!member, `needs ${MEMBER} and E2E_PASSWORD`);

    const H = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);
    const MARK = `MK${run}`;

    const post = async <T>(url: string, data: unknown): Promise<T> => {
      const res = await request.post(`${V1}${url}`, { headers: H, data });
      expect(res.ok(), `${url} must accept the seed — ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    };

    const a = await post<{ id: string }>('/projects/projects', { title: `Coll ${run} A`, code: `CO-${run}-A` });
    const b = await post<{ id: string }>('/projects/projects', { title: `Coll ${run} B`, code: `CO-${run}-B` });
    /**
     * THREE delivery roles on the one project, which is realistic and is also the only way to
     * separate the two reasons a request can be refused. QA/QC covers quality, commissioning and
     * engineering; HSE covers permits; Site Engineer covers daily reports. Without all three, an
     * `hse/ptws` 403 would look like a scoping failure when it is a job boundary — which is
     * exactly the confusion that made the first run of this spec fail.
     */
    for (const roleId of ['r-qa-qc', 'r-hse', 'r-site-engineer']) {
      await post(`/projects/${a.id}/members`, { userId: MEMBER, roleId });
    }

    // A marked record in EACH project. The marker is what makes a leak visible in a body.
    for (const [projectId, tag] of [[a.id, 'A'], [b.id, 'B']] as const) {
      await post('/engineering/drawings', { projectId, code: `${MARK}-${tag}-D`, title: 'seed', revision: '0' });
      await post('/quality/ncrs', { projectId, ncrNumber: `${MARK}-${tag}-N`, description: 'seed', severity: 'minor', system: 'cctv' });
      await post('/commissioning/records', { projectId, code: `${MARK}-${tag}-C`, title: 'seed', system: 'cctv' });
    }

    const body = async (url: string, token: string) => {
      const res = await request.get(`${V1}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      return { status: res.status(), text: res.ok() ? await res.text() : '' };
    };

    /**
     * The seven lists `/operations/reports` reads, plus the T&C workspace projection — which is an
     * AGGREGATE rather than a list, and therefore the shape most likely to have been written
     * tenant-wide without anyone noticing.
     */
    const SURFACES = [
      '/engineering/drawings',
      '/engineering/rfis',
      '/site/daily-reports',
      '/quality/ncrs',
      '/hse/ptws',
      '/commissioning/records',
      '/commissioning/records/workspace',
    ];

    for (const url of SURFACES) {
      // 1. Unscoped: whatever the answer, it must not contain another project's data.
      const plain = await body(url, member!);
      expect(plain.text, `${url}: an unscoped read must not return project B's data`).not.toContain(`${MARK}-B-`);

      // 2. Scoped to their own project: allowed, and containing only their own.
      const own = await body(`${url}?projectId=${a.id}`, member!);
      expect(own.status, `${url}: a member's own project must be readable`).toBe(200);
      expect(own.text, `${url}: and must not carry project B's data`).not.toContain(`${MARK}-B-`);

      // 3. Scoped to a project they are not in: refused outright, not filtered to empty. Filtering
      //    would also be safe, but refusing is what this system does and the distinction matters —
      //    an empty 200 and a 403 mean different things to the surface reading them.
      const other = await body(`${url}?projectId=${b.id}`, member!);
      expect(other.status, `${url}: another project must be refused`).toBe(403);
      expect(other.text, `${url}: and certainly must not return its rows`).not.toContain(`${MARK}-B-`);
    }

    // An org-wide grant still sees everything — proven so the absences above are known to be scope
    // and not an empty database.
    const orgWide = await body('/quality/ncrs', admin!.replace('Bearer ', ''));
    expect(orgWide.status).toBe(200);
    expect(orgWide.text, 'the seeded rows exist and are visible to an org grant').toContain(`${MARK}-B-N`);
  });

  test('a member can read the project they belong to, and cannot list the ones they cannot', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run');
    const member = await signIn(request, MEMBER);
    test.skip(!member, `needs ${MEMBER} and E2E_PASSWORD`);

    const H = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);
    const post = async <T>(url: string, data: unknown): Promise<T> => {
      const res = await request.post(`${V1}${url}`, { headers: H, data });
      expect(res.ok(), `${url} — ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    };

    const a = await post<{ id: string }>('/projects/projects', { title: `Disc ${run} A`, code: `DI-${run}-A` });
    const b = await post<{ id: string }>('/projects/projects', { title: `Disc ${run} B`, code: `DI-${run}-B` });
    // Project Manager, because it is the delivery role that carries `projects.*`. A QA/QC member is
    // refused a project read on their OWN project — correctly, and that is a job boundary, not a
    // scope failure. A spec that used the wrong role here would misread one as the other.
    await post(`/projects/${a.id}/members`, { userId: MEMBER, roleId: 'r-pm' });

    const status = async (url: string) =>
      (await request.get(`${V1}${url}`, { headers: { Authorization: `Bearer ${member}` } })).status();

    // A project resolves to ITSELF, which is what gives a project-scoped grant something to match.
    // Before that, a member could not read the project they were a member of — the route parameter
    // is `:id`, not `:projectId`, so the guard saw no project at all.
    expect(await status(`/projects/projects/${a.id}`), 'a member reads their own project').toBe(200);
    expect(await status(`/projects/projects/${b.id}`), 'and not one they are not in').toBe(403);

    /**
     * THE KNOWN GAP, asserted so it cannot be forgotten or quietly "fixed" by widening.
     *
     * A list has no id, so there is nothing to resolve, and a project-scoped grant matches nothing:
     * the member is refused. That is safe — no leak — but it means a member cannot discover which
     * projects they belong to, which is the foundation the project-centric UX needs. Closing it is
     * a feature (a list filtered to the caller's grants), not a bug fix, and it is deliberately not
     * in this phase.
     *
     * If this ever starts returning 200, it must be because such a filtered list was built — and
     * this assertion is what will force that to be a decision rather than a regression.
     */
    expect(await status('/projects/projects'), 'listing all projects stays closed to a member').toBe(403);
    expect(await status('/projects/projects/paged'), 'and so does the paged list').toBe(403);
  });
});
