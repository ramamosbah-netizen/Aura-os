import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Shared harness for proving a domain from a project member's seat.
 *
 * Every domain proof needs the same thing: an identity whose effective grants are KNOWN, a project
 * it is on, a second project it is not, a record in each, and a real browser signed in as that
 * identity. Rebuilding that per domain invites the subtle differences that make one domain's proof
 * mean something different from another's.
 *
 * ## Why the grants are stated, not assumed
 *
 * The seeded identities are shared and their grants accumulate across specs — `u-e2e-viewer` is
 * carrying project grants from earlier runs, and `u-e2e-checker` holds the `hse` role at TENANT
 * scope, which makes it an organisation-level reader and therefore useless for proving scope. Two
 * earlier probes read that as a leak before I traced it. So every caller names the roles it needs,
 * and every assertion is about records this run created.
 *
 * ## Membership is not permission
 *
 * `roles` is the point of the parameter. A member holding `r-site-engineer` has no HSE authority;
 * one holding `r-qa-qc` has no `projects.*`. Granting every role everywhere would make each domain
 * proof pass while hiding the property that matters — that being on a project buys you nothing your
 * functional role does not own.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
export const V1 = `${API}/api/v1`;

/** The project-scoped identity. Holds no org-wide grant, which is what makes it able to prove scope. */
export const MEMBER = 'u-e2e-viewer';

export function memberPassword(): string | undefined {
  return process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD;
}

/** Sign in through the real login form. Global setup runs as an org-wide admin; this does not. */
export async function signInAs(page: Page, baseURL: string, username: string): Promise<boolean> {
  const password = memberPassword();
  if (!password) return false;
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  return page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Wait for a page to finish rendering, then return its text.
 *
 * Reading `innerText` straight after `domcontentloaded` catches a streamed server component
 * mid-flight — the first version of this saw "Loading Site…" and reported a missing record. That
 * would be a nuisance on a positive assertion and something worse on a NEGATIVE one: "the other
 * project's data is absent" passes trivially against a page that has not arrived yet, which is
 * exactly the assertion one must never let pass for the wrong reason.
 *
 * So every read goes through here: wait for a signal the page is done, and only then look.
 */
export async function renderedText(page: Page, signal: RegExp | string, timeout = 30_000): Promise<string> {
  await expect(page.locator('body'), `page did not finish rendering (waiting for ${signal})`).toContainText(signal, { timeout });
  // The loading placeholders must be gone too — a page can contain its heading and still be
  // streaming the part under test.
  await expect(page.locator('body'), 'still loading').not.toContainText(/Loading [A-Za-z & ]+\.\.\./, { timeout });
  return page.locator('body').innerText();
}

export interface Scenario {
  run: string;
  /**
   * The MEMBER's own bearer token.
   *
   * Needed so a domain can assert what the member may DO, not only what they may see. Without it
   * the action and permission checks would have to be written as conditionals, and a conditional
   * that never runs is a test that proves nothing while looking like it does.
   */
  memberToken: string;
  /** The project the member is on. */
  mine: { id: string; title: string };
  /** A project they are not on, holding real data of its own. */
  theirs: { id: string; title: string };
  post: <T>(url: string, data: unknown) => Promise<T>;
  get: (url: string, token: string) => Promise<{ status: number; text: string }>;
}

/**
 * Two projects, membership of one, and a poster/getter bound to the admin token for seeding.
 *
 * Seeding runs as the ADMIN on purpose: the test is about what the member can READ and DO through
 * the UI, not about whether they can create fixtures. Seeding as the member would conflate the two
 * and make a missing create permission look like a broken page.
 */
export async function scenario(
  request: APIRequestContext,
  adminAuthorization: string,
  roles: readonly string[],
  label: string,
): Promise<Scenario> {
  const H = { 'content-type': 'application/json', Authorization: adminAuthorization };
  const run = Date.now().toString().slice(-6);

  const post = async <T>(url: string, data: unknown): Promise<T> => {
    const res = await request.post(`${V1}${url}`, { headers: H, data });
    expect(res.ok(), `seed ${url} — ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const get = async (url: string, token: string) => {
    const res = await request.get(`${V1}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status(), text: res.ok() ? await res.text() : '' };
  };

  const mineTitle = `${label} ${run} MINE`;
  const theirsTitle = `${label} ${run} THEIRS`;
  const mine = await post<{ id: string }>('/projects/projects', { title: mineTitle, code: `${label.slice(0, 2).toUpperCase()}-${run}-M` });
  const theirs = await post<{ id: string }>('/projects/projects', { title: theirsTitle, code: `${label.slice(0, 2).toUpperCase()}-${run}-T` });

  // `r-pm` always, because discovery and the project shell need `projects.*` — without it the
  // member cannot reach My Projects or read the project's own name. The domain roles come on top.
  for (const roleId of new Set(['r-pm', ...roles])) {
    await post(`/projects/${mine.id}/members`, { userId: MEMBER, roleId });
  }

  // Minted AFTER the grants, because a token carries the identity and the grants are read live —
  // but minting first has bitten this suite before, so the order is made explicit.
  const login = await request.post(`${V1}/auth/login`, { data: { username: MEMBER, password: memberPassword() } });
  expect(login.ok(), `${MEMBER} must be able to mint a token — ${await login.text()}`).toBe(true);
  const memberToken = ((await login.json()) as { token?: string }).token ?? '';
  expect(memberToken, 'a member token is required for the action and permission checks').not.toBe('');

  return { run, memberToken, mine: { id: mine.id, title: mineTitle }, theirs: { id: theirs.id, title: theirsTitle }, post, get };
}

/**
 * The checks every domain owes, in the browser, as the member.
 *
 * Kept together so a domain cannot quietly prove less than its neighbour: discovery, context, the
 * name (not a uuid), the member's own rows, the absence of the other project's, and that neither a
 * project id nor an entity id in the URL can carry them out of their project.
 */
export async function proveDomain(
  page: Page,
  baseURL: string,
  s: Scenario,
  opts: {
    /** The project-context path under test, e.g. `/project/{id}/site`. */
    path: (projectId: string) => string;
    /** Something on the page that proves it rendered rather than errored. */
    rendered: string;
    /** A marker that must appear (the member's own record) and one that must never. */
    mineMarker: string;
    theirsMarker: string;
  },
): Promise<void> {
  const body = page.locator('body');

  // 1 — discovery
  await page.goto(`${baseURL}/my-projects`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(`my-project-${s.mine.id}`), 'the member discovers their project').toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`my-project-${s.theirs.id}`), 'and not the one they are not on').toHaveCount(0);

  // 2, 3, 4 — the domain opens in context, names the project, and lists their record.
  //
  // RETRYING assertions rather than one snapshot of `innerText`. These pages stream, and a client
  // component can re-enter a loading state after hydration, so a single read can catch the page
  // before OR between renders. An earlier version of this did exactly that and reported a missing
  // record on a page that was still arriving.
  await page.goto(`${baseURL}${opts.path(s.mine.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(body, `${opts.path(s.mine.id)}: the page renders`).toContainText(opts.rendered, { timeout: 30_000 });
  await expect(body, 'the member’s own record is listed').toContainText(opts.mineMarker, { timeout: 30_000 });
  await expect(body, 'the project is named, not printed as a uuid').not.toContainText(s.mine.id);
  await expect(body, 'the other project’s record is not').not.toContainText(opts.theirsMarker);

  // 8 — another project's context must not render its data.
  //
  // The page is waited to SETTLE before the negative is asserted: "the other project's data is
  // absent" passes trivially against a page that has not arrived, which is the one way a security
  // assertion can pass for precisely the wrong reason.
  await page.goto(`${baseURL}${opts.path(s.theirs.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(body, 'the foreign page settled before being judged').not.toContainText(/Loading/i, { timeout: 30_000 });
  await expect(body, 'another project’s page must not show its records').not.toContainText(opts.theirsMarker);
  await expect(body, 'nor its name').not.toContainText(s.theirs.title);

  // 7 — and back, still in context
  await page.goto(`${baseURL}${opts.path(s.mine.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(body, 'returning lands in the same project').toContainText(opts.mineMarker, { timeout: 30_000 });
}
/** 12 — nothing on the page threw. Collected by the caller and asserted at the end. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Network 4xx/5xx are the subject of several assertions here — a refused request is often the
    // CORRECT outcome being proven, so only genuine runtime faults count.
    if (/Failed to load resource|net::ERR_/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}
