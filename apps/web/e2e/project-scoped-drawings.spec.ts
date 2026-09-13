import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * Project-scoped enforcement for entity-addressed drawing routes.
 *
 * The first reference implementation of the project-centric pattern: membership → project-scoped
 * route → permission guard → record lookup → `drawing.projectId === route.projectId` → answer.
 *
 * ## What was actually broken, and in which direction
 *
 * The guard (`core/src/identity/permissions.guard.ts`) can stamp `resource: project:<id>` onto an
 * access target only when the project is knowable WITHOUT loading the record — a `:projectId` param,
 * or `projectId` in the body or query. `GET /engineering/drawings/:id` carries none, so it fell
 * through to an org-wide grant. That failed BOTH ways at once:
 *
 *   • an org-grant holder could read any drawing on any project, and
 *   • a project MEMBER could read none — not even their own project's — because a project-scoped
 *     grant has nothing to match when the target has no resource.
 *
 * The second half is the one that surprised: project isolation was not merely absent, it was
 * inverted. The people it should admit were the people it locked out.
 *
 * ## Two checks, and why neither is sufficient alone
 *
 *   1. the guard, BEFORE the fetch: may this actor act on the project in the path?
 *   2. the service, AFTER it: does the record actually belong to that project?
 *
 * Without (2), a member of A who learns an id belonging to B can ask for it under A and the guard
 * will allow it — the URL asserts a relationship the data does not have. Without (1) there is no
 * authorisation at all. The URL-lie case below is (2) catching what (1) structurally cannot.
 *
 * ## This spec only means something with auth ON
 *
 * The guard and the service both pass through when no verifier is configured — the staged seam the
 * whole platform uses. A run without auth would make every assertion here vacuous, so the spec
 * SKIPS rather than passing, and says so.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const V1 = `${API}/api/v1`;

/** A member identity that holds no org-wide grant — the only kind that can prove scoping. */
const MEMBER = 'u-e2e-viewer';
/**
 * NOT USED AS THE NON-MEMBER, and the reason is worth recording rather than quietly routing
 * around: `u-e2e-checker` holds the `hse` role at TENANT scope, which carries `engineering.*.read`
 * — an org-wide grant. It is a perfectly legitimate identity; it simply cannot demonstrate what
 * happens to someone with no claim on a project, because it has a claim on all of them.
 *
 * So non-membership is proven with the member identity against a project it was never added to.
 * That is the same property — no grant covers this project — asserted on an identity whose grants
 * this spec creates and therefore knows.
 */
const ORG_WIDE_READER = 'u-e2e-checker';


async function signIn(request: APIRequestContext, username: string): Promise<string | null> {
  const password = process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
  if (!password) return null;
  const res = await request.post(`${V1}/auth/login`, { data: { username, password } });
  if (!res.ok()) return null;
  return ((await res.json()) as { token?: string }).token ?? null;
}

test.describe('project-scoped drawing access', () => {
  test.setTimeout(180_000);

  test('a project member reaches their own drawings and nobody else’s', async ({ request }) => {
    const admin = apiAuthHeaders().Authorization;
    test.skip(!admin, 'auth is off for this run — every assertion here would pass vacuously');

    const memberToken = await signIn(request, MEMBER);
    const orgWideToken = await signIn(request, ORG_WIDE_READER);
    test.skip(
      !memberToken || !orgWideToken,
      `needs the seeded identities (${MEMBER}, ${ORG_WIDE_READER}) and E2E_PASSWORD to sign them in`,
    );

    const adminH = { 'content-type': 'application/json', Authorization: admin! };
    const run = Date.now().toString().slice(-6);

    // ── Two projects, a drawing in each, and membership of ONE of them ──────────────────────────
    const project = async (suffix: string) =>
      (await (await request.post(`${V1}/projects/projects`, {
        headers: adminH,
        data: { title: `Scope ${run} ${suffix}`, code: `SC-${run}-${suffix}` },
      })).json()) as { id: string };

    const a = await project('A');
    const b = await project('B');

    const drawing = async (projectId: string, suffix: string) =>
      (await (await request.post(`${V1}/engineering/drawings`, {
        headers: adminH,
        data: { projectId, code: `SC-${run}-${suffix}`, title: `Drawing ${suffix}`, revision: '0' },
      })).json()) as { id: string };

    const drawingA = await drawing(a.id, 'A');
    const drawingB = await drawing(b.id, 'B');

    // Membership IS the grant — there is no separate membership store. `r-site-engineer` is one of
    // the four delivery roles the team screen may assign.
    const joined = await request.post(`${V1}/projects/${a.id}/members`, {
      headers: adminH,
      data: { userId: MEMBER, roleId: 'r-site-engineer' },
    });
    expect(joined.ok(), `membership must be granted — ${await joined.text()}`).toBe(true);

    const status = async (url: string, token: string) =>
      (await request.get(`${V1}${url}`, { headers: { Authorization: `Bearer ${token}` } })).status();

    const scopedA = `?projectId=${encodeURIComponent(a.id)}`;
    const scopedB = `?projectId=${encodeURIComponent(b.id)}`;

    // ── 1. Member of A → drawing A ✅ ────────────────────────────────────────────────────────────
    expect(
      await status(`/engineering/drawings/${drawingA.id}${scopedA}`, memberToken!),
      'a member must reach their own project’s drawing — before this slice they could not',
    ).toBe(200);
    expect(await status(`/engineering/drawings${scopedA}`, memberToken!), 'and list it').toBe(200);

    // ── 2. Member of A → drawing B ❌ ────────────────────────────────────────────────────────────
    expect(
      await status(`/engineering/drawings/${drawingB.id}${scopedB}`, memberToken!),
      'another project’s drawing is refused at the guard',
    ).toBe(403);
    expect(await status(`/engineering/drawings${scopedB}`, memberToken!), 'and so is its list').toBe(403);

    // ── 3. The URL lie: B’s drawing asked for under A ❌ ─────────────────────────────────────────
    // The guard ALLOWS this — the caller is a member of A and A is what the request says. Only the
    // check against the loaded record catches it, which is the whole reason that check exists.
    expect(
      await status(`/engineering/drawings/${drawingB.id}${scopedA}`, memberToken!),
      'a drawing that does not belong to the project in the request must not be returned',
    ).toBe(404);

    // ── 4. No membership of the project → refused, even holding a membership elsewhere ❌ ───────
    // This is the non-member case. It uses the member identity against a project it never joined
    // rather than a second person, because the other seeded identity holds an org-wide grant and
    // so cannot demonstrate the absence of one — see ORG_WIDE_READER above. Same property, on an
    // identity whose grants this spec created and therefore knows.
    const c = await project('C');
    const drawingC = await drawing(c.id, 'C');
    expect(
      await status(`/engineering/drawings/${drawingC.id}?projectId=${encodeURIComponent(c.id)}`, memberToken!),
      'holding membership of A grants nothing on C',
    ).toBe(403);

    // And the org-wide reader is NOT refused — the same request, a different claim. Asserted so
    // the 403 above is known to come from the missing grant rather than from a broken route.
    expect(
      await status(`/engineering/drawings/${drawingC.id}?projectId=${encodeURIComponent(c.id)}`, orgWideToken!),
      'an org-wide engineering reader passes where the project member does not',
    ).toBe(200);

    // ── 5. An org-wide grant is untouched by all of this ─────────────────────────────────────────
    // Proven because a scoping change that quietly narrowed the administrators would be a
    // regression dressed as a security fix.
    expect(await status(`/engineering/drawings/${drawingB.id}`, admin!.replace('Bearer ', '')), 'admin still reads anything').toBe(200);

    // ── 6. The route the guard cannot read a project out of stays shut to members ────────────────
    // Recorded rather than fixed: `/engineering/drawings/:id` with no project is the shape this
    // slice replaces, and it is deliberately NOT made to work for members — the project-scoped
    // route is the way in.
    expect(
      await status(`/engineering/drawings/${drawingA.id}`, memberToken!),
      'the project-less route gives the guard nothing to match, so a member is refused',
    ).toBe(403);
  });
});
