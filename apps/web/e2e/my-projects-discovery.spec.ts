import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * Governed project discovery — "which projects may I see?", answered at the backend boundary.
 *
 * ## Why an endpoint had to exist at all
 *
 * Every other list is authorised against a project the REQUEST names. This one has no project to
 * name, so the guard would derive `projects.project.read` with no resource, only an org-wide grant
 * could satisfy it, and every project member — the people it exists for — would be refused. The
 * handler authorises itself against the actor's own grants instead (`@SelfScoped`, fenced by
 * `self-scoped-routes.fitness.test.ts`).
 *
 * ## Why every assertion here is RELATIVE
 *
 * A first draft of this checked absolute counts against the seeded identities, and was wrong twice
 * over: `u-e2e-viewer` carries project grants left by earlier specs, and `u-e2e-checker` holds the
 * `hse` role at TENANT scope, which carries `projects.*.read` — so it legitimately sees everything
 * and my probe read that as a leak. The identities are shared and their grants accumulate.
 *
 * So this asserts only about projects it creates itself, and about how the answer CHANGES when a
 * grant is added. That holds whatever else the identity happens to carry, and it is the property
 * that actually matters: a project appears when, and only when, it is granted.
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

interface MinePage {
  items: Array<{ id: string; title: string; tenantId?: string }>;
  total: number;
  scope: 'organisation' | 'projects' | 'none';
}

test.describe('My Projects — governed discovery', () => {
  test.setTimeout(240_000);

  test('a project appears when, and only when, it is granted', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run — every assertion here would pass vacuously');
    const member = await signIn(request, MEMBER);
    test.skip(!member, `needs ${MEMBER} and E2E_PASSWORD`);

    const H = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);

    const post = async <T>(url: string, data: unknown): Promise<T> => {
      const res = await request.post(`${V1}${url}`, { headers: H, data });
      expect(res.ok(), `${url} — ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    };

    const mine = async (token: string, qs = ''): Promise<MinePage> => {
      const res = await request.get(`${V1}/projects/projects/mine${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status(), 'discovery must answer, not refuse — an empty entitlement is an empty page').toBe(200);
      return (await res.json()) as MinePage;
    };
    /** Only the projects this test created, so other specs' data cannot affect the result. */
    const ours = (p: MinePage) => p.items.map((i) => i.title).filter((t) => t.includes(`Mine ${run}`)).sort();

    const a = await post<{ id: string }>('/projects/projects', { title: `Mine ${run} ALPHA`, code: `MI-${run}-A` });
    const b = await post<{ id: string }>('/projects/projects', { title: `Mine ${run} BETA`, code: `MI-${run}-B` });
    const c = await post<{ id: string }>('/projects/projects', { title: `Mine ${run} GAMMA`, code: `MI-${run}-C` });

    // ── Not a member: none of the three is discoverable ──────────────────────────────────────────
    expect(ours(await mine(member!)), 'an ungranted project must not appear').toEqual([]);

    // ── Member of A ──────────────────────────────────────────────────────────────────────────────
    // r-pm because it is the delivery role carrying `projects.*`. Scope and function are separate
    // dimensions and BOTH must hold — the role-without-permission case is asserted below.
    await post(`/projects/${a.id}/members`, { userId: MEMBER, roleId: 'r-pm' });
    expect(ours(await mine(member!)), 'the granted project, and only it').toEqual([`Mine ${run} ALPHA`]);

    // ── Member of A + B ──────────────────────────────────────────────────────────────────────────
    await post(`/projects/${b.id}/members`, { userId: MEMBER, roleId: 'r-pm' });
    expect(ours(await mine(member!)), 'both granted projects').toEqual([`Mine ${run} ALPHA`, `Mine ${run} BETA`]);

    // ── C is real, and never theirs ──────────────────────────────────────────────────────────────
    const all = await mine(member!);
    expect(all.items.map((i) => i.id), 'an ungranted project is absent from the page entirely').not.toContain(c.id);

    // ── Membership WITHOUT the functional permission grants no discovery ─────────────────────────
    // QA/QC is a real project role and carries no `projects.*` at all. Being on the project is not
    // the same as being allowed to read it, and over-reporting here would be the easy mistake.
    await post(`/projects/${c.id}/members`, { userId: MEMBER, roleId: 'r-qa-qc' });
    expect(
      (await mine(member!)).items.map((i) => i.id),
      'a project grant whose role cannot read projects must not make it discoverable',
    ).not.toContain(c.id);

    // ── Search runs over the AUTHORISED set, not the tenant then filtered ────────────────────────
    const found = await mine(member!, '?q=BETA');
    expect(ours(found)).toEqual([`Mine ${run} BETA`]);
    const hidden = await mine(member!, '?q=GAMMA');
    expect(ours(hidden), 'searching for a project they cannot see finds nothing').toEqual([]);
    expect(hidden.total, 'and the COUNT reflects the authorised set, not the tenant').toBe(0);

    // ── Pagination is over the authorised set too ────────────────────────────────────────────────
    const paged = await mine(member!, '?limit=1');
    expect(paged.items.length, 'one row on a page of one').toBe(1);
    const firstPage = await mine(member!, '?q=Mine ' + run + '&limit=1');
    const secondPage = await mine(member!, '?q=Mine ' + run + '&limit=1&offset=1');
    expect(firstPage.total, 'the total counts only the two granted projects').toBe(2);
    expect(secondPage.items[0]?.id, 'the second page holds the other one').not.toBe(firstPage.items[0]?.id);

    // ── Tenant isolation is unchanged and independent of any of this ─────────────────────────────
    const tenants = new Set((await mine(member!)).items.map((i) => i.tenantId).filter(Boolean));
    expect([...tenants].length, 'every project returned belongs to one tenant — the caller’s').toBeLessThanOrEqual(1);
  });

  test('an organisation-level reader sees across projects, and says so', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run');
    const H = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);

    const created = await request.post(`${V1}/projects/projects`, {
      headers: H,
      data: { title: `Org ${run} ONE`, code: `OR-${run}-1` },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const project = (await created.json()) as { id: string };

    const res = await request.get(`${V1}/projects/projects/mine`, { headers: { Authorization: admin! } });
    expect(res.status()).toBe(200);
    const page = (await res.json()) as MinePage;

    // The scope is part of the answer, not an implementation detail: the UI needs to know whether it
    // is showing "your projects" or "the organisation's", and a caller should not have to infer it
    // from how many rows came back.
    expect(page.scope, 'an org grant is reported as organisation scope').toBe('organisation');

    // Reachable without any membership — an org grant is not a list of projects, it is the absence
    // of that restriction, and this is the difference the endpoint must preserve.
    const search = await request.get(`${V1}/projects/projects/mine?q=Org ${run}`, { headers: { Authorization: admin! } });
    const hits = (await search.json()) as MinePage;
    expect(hits.items.map((i) => i.id), 'a project nobody made them a member of').toContain(project.id);
  });
});
