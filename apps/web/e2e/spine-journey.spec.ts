// AURA OS — G-03: acquisition-to-cash spine, browser E2E.
//
// The audit's ship-gate for G-03 is the SPINE journey, not any journey: the five delivery-half
// specs (drawing/ncr/document/site/commissioning) prove the modules that were built last, while
// the commercially critical path — account → opportunity → quotation → contract → project →
// invoice — had no browser coverage at all. This file closes that.
//
// Every record here is created THROUGH THE UI (open the drawer, fill it, submit) and then read
// back THROUGH THE UI (find it in the register that a user would look at). Seeding over the BFF
// would prove the API works, which the 41 Supertest specs already do; it would not prove the page
// a user actually operates still works.
//
// Unlike the delivery-half specs, an unreachable API FAILS this suite under CI rather than
// skipping it. A ship-gate that can silently no-op is the exact failure mode the audit flagged
// (N-04: "verified" by checks that cannot exercise the journey). Outside CI it still skips, so a
// developer running the web app alone is not blocked.
import { expect, test, type Page } from '@playwright/test';
import { runId } from './fixtures';

// One suffix per run keeps records unique across reruns against the same in-memory API.
const RUN = runId();
const name = (entity: string) => `E2E ${entity} ${RUN}`;

const ACCOUNT = name('Account');
const OPPORTUNITY = name('Opportunity');
const QUOTE_SUBJECT = name('Quote');
const CONTRACT = name('Contract');
const PROJECT = name('Project');
const INVOICE = name('Invoice');

test.beforeAll(async ({ request, baseURL }) => {
  // Probe the BFF once. In CI the web-smoke job hard-fails if the API never became healthy, so
  // reaching this point with a dead API means something is genuinely broken — fail loudly.
  const res = await request.get(`${baseURL}/api/crm/accounts`).catch(() => null);
  const reachable = res !== null && res.status() !== 502 && res.status() !== 404;
  if (!reachable) {
    if (process.env.CI) throw new Error('spine E2E: API is not reachable behind the web shell');
    test.skip(true, 'API not running behind the web shell — start it to run the spine suite');
  }
});

/** Open a shared-drawer create form, fill the given fields, submit, and wait for it to close. */
async function createViaDrawer(
  page: Page,
  slug: string,
  fields: Record<string, string>,
): Promise<void> {
  // Open it by RESULT, not by one hopeful click — and say so when the first click does not take.
  //
  // In TIER-3, `contract: create -> read in the register` clicked this button successfully and then
  // waited out a full 30s for a drawer that never appeared, while the two tests after it drove the
  // same helper and passed in about a second each. The page snapshot at failure shows the Contracts
  // page fully rendered with the button present, so the click reached a real element.
  //
  // What the code rules out: `openDrawer` in FormDrawer.tsx is synchronous — `engine.reset()`,
  // `setErr(null)`, `setOpen(true)` — and the drawer renders directly off `open`. Nothing is
  // fetched, so no slow query and no cold backend can explain a 30s wait. The only remaining
  // reading is that the click never invoked the handler: it landed on server-rendered markup whose
  // React listener was not attached yet (every caller navigates with `waitUntil:
  // 'domcontentloaded'`).
  //
  // That is a reading, not a proof — an attempt to force it locally by stalling all 27 client
  // chunks for 4s each did NOT reproduce it, because React replays discrete events captured during
  // hydration. So the retry is offered as the right instrument for a click that did not take, not
  // as a closed diagnosis. Two consecutive TIER-3 runs failed here on DIFFERENT tests — `contract`,
  // then `opportunity` — which is what a transient looks like and what a product defect does not.
  //
  // Which is why it reports. A drawer that genuinely needs two clicks is a PRODUCT defect from a
  // user's point of view, and a silent retry would convert that defect into a green test. The
  // warning keeps the evidence in the log; the retry only keeps one unexplained transient from
  // failing an unrelated assertion. The click is re-issued only while the drawer is still closed,
  // so a toggle cannot be driven shut, and a drawer that never opens still fails exactly as before.
  const drawer = page.getByTestId(`drawer-${slug}`);
  let attempts = 0;
  await expect(async () => {
    if (!(await drawer.isVisible())) {
      attempts += 1;
      await page.getByTestId(`create-${slug}`).click();
    }
    await expect(drawer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  if (attempts > 1) {
    console.warn(`e2e: the ${slug} drawer needed ${attempts} clicks to open — investigate, do not normalise`);
  }

  for (const [field, value] of Object.entries(fields)) {
    await drawer.getByTestId(`field-${field}`).fill(value);
  }

  await drawer.getByTestId(`submit-${slug}`).click();

  // A surfaced API error is far more useful than a timeout on the closed-drawer assertion.
  const error = drawer.getByTestId(`drawer-error-${slug}`);
  if (await error.isVisible().catch(() => false)) {
    throw new Error(`create ${slug} failed: ${await error.innerText()}`);
  }
  await expect(drawer).toBeHidden();
}

/**
 * The `login →` half of G-03's acceptance criterion.
 *
 * Every other test in this file inherits a session from global setup. This one throws that away and
 * signs in from scratch through the real form, so the journey a user actually performs is proven
 * rather than assumed. When auth is off it asserts the weaker thing that is true then — the login
 * route renders and the spine is reachable — instead of pretending to have tested a sign-in.
 */
test.describe('login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sign in through the real form, then reach the spine', async ({ page, baseURL }) => {
    const status = await page.request.get(`${baseURL}/api/auth/status`).catch(() => null);
    const authEnabled = status?.ok() ? (((await status.json()) as { enabled?: boolean }).enabled ?? false) : false;

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('login-username')).toBeVisible();

    if (!authEnabled) {
      // No verifier configured: there is no credential to present, and the API runs as the dev
      // actor. Say so rather than reporting a sign-in that never happened.
      test.info().annotations.push({
        type: 'note',
        description: 'API has no JWT verifier configured — sign-in not exercised, spine reachability asserted instead.',
      });
      await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('accounts-portfolio').or(page.getByTestId('create-account'))).toBeVisible();
      return;
    }

    await page.getByTestId('login-username').fill(process.env.E2E_USERNAME ?? 'u-admin');
    await page.getByTestId('login-password').fill(process.env.E2E_PASSWORD ?? process.env.AUTH_DEV_PASSWORD ?? 'e2e-password');
    await page.getByTestId('login-submit').click();

    // Signed in: off /login, and the spine is reachable with the session just established.
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-account')).toBeVisible();
  });
});

/**
 * G-05: a refused read must not render as an empty one.
 *
 * This is the assertion that would have caught the original defect. `getJson` returned `null` for
 * every failure, so a signed-out user looking at the account portfolio saw exactly what a user with
 * genuinely zero accounts saw. For an ERP that is not a cosmetic problem: "you have no customers"
 * and "we could not tell you about your customers" are different statements, and only one of them
 * is ever true.
 *
 * Runs signed OUT on purpose — with a verifier configured the API refuses, which is the real-world
 * shape of an expired session or a missing grant.
 */
test.describe('refused reads', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a denied portfolio read says denied, not empty', async ({ page, baseURL }) => {
    const status = await page.request.get(`${baseURL}/api/auth/status`).catch(() => null);
    const authOn = status?.ok() ? (((await status.json()) as { enabled?: boolean }).enabled ?? false) : false;
    test.skip(!authOn, 'no verifier configured — an unauthenticated read succeeds as the dev actor');

    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });

    // This case asserts what an anonymous read RENDERS, which only exists with the optimistic
    // gate off — playwright.config.ts pins WEB_AUTH_REQUIRED=false on this server so the
    // developer's .env.local cannot change the meaning of the test. The gate-on behaviour is
    // asserted just as explicitly, in web-auth-gate.spec.ts.

    // The distinction itself: an error surface, not a zero-row table.
    const notice = page.getByTestId('data-error');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-error-kind', /forbidden|unauthorized/);

    // And it must never imply the tenant simply has no data.
    await expect(notice).not.toContainText(/no accounts/i);
    await expect(page.getByTestId('accounts-portfolio')).toHaveCount(0);
  });
});

test('account: create → read in the portfolio', async ({ page }) => {
  await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' });
  await createViaDrawer(page, 'account', { name: ACCOUNT });
  await expect(page.getByTestId('accounts-portfolio')).toContainText(ACCOUNT);
});

test('opportunity: create → read in the pipeline list', async ({ page }) => {
  // The deal board lives on /crm/pipeline. It used to be /crm/leads, until d80d40ad split Sales
  // into its own pages: /crm/leads became a leads-only workspace and the opportunity create drawer
  // went with the pipeline. This spec kept pointing at /crm/leads and had failed on every run since.
  await page.goto('/crm/pipeline', { waitUntil: 'domcontentloaded' });
  await createViaDrawer(page, 'opportunity', { title: OPPORTUNITY });

  await page.getByTestId('pipeline-tab-list').click();
  await expect(page.getByTestId('opportunities-list')).toContainText(OPPORTUNITY);
});

test('quotation: create → read in the workspace', async ({ page }) => {
  // Authoring lives in the operational register; Overview is read/analytics-only in the Sales IA.
  await page.goto('/crm/quotations/register?view=list', { waitUntil: 'domcontentloaded' });

  // Quotation authoring is deliberately two-step and does NOT use the shared drawer: step one
  // captures customer + subject, then redirects to the pricing sheet to author the lines.
  await page.getByTestId('create-quotation').click();
  const drawer = page.getByTestId('drawer-quotation');
  await expect(drawer).toBeVisible();

  // Customer is select-or-create: typing the account made above reuses it rather than
  // spawning a duplicate party.
  await drawer.getByTestId('field-customer').fill(ACCOUNT);
  await drawer.getByTestId('field-subject').fill(QUOTE_SUBJECT);
  await drawer.getByTestId('submit-quotation').click();

  // Step two: the pricing sheet for the new quotation.
  await expect(page).toHaveURL(/\/crm\/quotations\/[^/]+\/pricing/);

  // Read it back where a user would look for it.
  await page.goto('/crm/quotations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('quotations-recent')).toContainText(ACCOUNT);
});

test('contract: create → read in the register', async ({ page }) => {
  await page.goto('/contracts/contracts', { waitUntil: 'domcontentloaded' });
  await createViaDrawer(page, 'contract', { title: CONTRACT });
  await expect(page.getByTestId('contracts-register')).toContainText(CONTRACT);
});

test('project: create → read in the register', async ({ page }) => {
  await page.goto('/projects/projects', { waitUntil: 'domcontentloaded' });
  await createViaDrawer(page, 'project', { title: PROJECT });
  await expect(page.getByTestId('projects-register')).toContainText(PROJECT);
});

test('invoice: create → read in the list', async ({ page }) => {
  await page.goto('/finance/invoices', { waitUntil: 'domcontentloaded' });
  await createViaDrawer(page, 'invoice', { title: INVOICE });
  await expect(page.getByTestId('invoices-list')).toContainText(INVOICE);
});
