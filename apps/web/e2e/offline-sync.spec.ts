// AURA OS — offline field journey, end to end (gap register N-01).
//
// The offline engine has existed since the batch landed and its only test was one assertion over
// generateUUID. Infrastructure is not reliability: IndexedDB, backoff and a status badge prove
// nothing about whether a site engineer's report survives losing signal, and nothing at all about
// whether it arrives once or twice.
//
// This drives the real journey:
//
//   create → offline → queued in IndexedDB → reconnect → sync → server has it, ONCE
//   and the crash case: killed mid-sync → reopened → queue resumes → still ONCE
//
// The duplicate protection under test is the idempotency work (f1b1ff7 · 94853b9 · 199f12e).
// A browser that dies after the request reached the server but before the response arrived is
// exactly the case the client cannot distinguish from failure — it retries, and only the
// server-side lease keeping the same Idempotency-Key from executing twice makes that safe.
import { expect, request as apiRequest, test, type Page } from '@playwright/test';

const REPORTS_URL = '/site/daily-reports';
import { apiAuthHeaders } from './api-auth';

const API_BASE = process.env.AURA_API_URL ?? 'http://localhost:4000';
/** Marks rows this spec creates so assertions can count only their own. */
const TAG = `e2e-offline-${Date.now()}`;

/** Read the offline queue straight out of IndexedDB — the engine exposes no window handle. */
async function readQueue(page: Page): Promise<Array<{ status: string; endpoint: string; operationId: string }>> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('aura_offline_db', 1);
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('offline_queue')) return resolve([]);
          const req = db.transaction('offline_queue', 'readonly').objectStore('offline_queue').getAll();
          req.onsuccess = () => resolve(req.result ?? []);
          req.onerror = () => resolve([]);
        };
      }),
  );
}

/** Count reports the API actually holds carrying our tag. */
async function serverCount(page: Page, tag: string): Promise<number> {
  return page.evaluate(async (t) => {
    try {
      const res = await fetch('/api/site/daily-reports', { cache: 'no-store' });
      if (!res.ok) return -1;
      const rows = (await res.json()) as Array<{ workDescription?: string }>;
      return rows.filter((r) => (r.workDescription ?? '').includes(t)).length;
    } catch {
      // Called while the context is offline on purpose — a thrown fetch is the expected answer,
      // not a test error.
      return -1;
    }
  }, tag);
}

/**
 * Fill the new-report form.
 *
 * This used to return false when it could not drive the page, and each caller turned that into
 * `test.skip`. In CI — which ran the web server with no API behind it — that meant every test in
 * this file skipped itself and reported green. A test that cannot run is a gap, not a pass, so
 * every unmet precondition below now throws.
 */
async function fillReport(page: Page, description: string): Promise<void> {
  const work = page.getByPlaceholder('Containment 2nd fix, L3 east');
  await work.waitFor({ state: 'visible', timeout: 45_000 });

  // Project is required and its picker fetches after hydration, so wait for real options rather
  // than reading the server-rendered "Loading projects…" placeholder and giving up.
  const picker = page.locator('select').first();
  if (await picker.isVisible().catch(() => false)) {
    await expect
      .poll(
        async () =>
          picker.locator('option').evaluateAll((os) => os.filter((o) => (o as HTMLOptionElement).value).length),
        { timeout: 30_000, intervals: [400] },
      )
      .toBeGreaterThan(0);
    const values = await picker.locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
    );
    expect(values, 'the project picker must offer a project to file against').not.toHaveLength(0);
    await picker.selectOption(values[0]);
  }

  await work.fill(description);
  await page.getByPlaceholder('0').first().fill('4');
}

test.describe('offline field journey', () => {
  // A report has to be filed against a project, and CI boots the API on empty in-memory stores,
  // so the picker has no options unless this spec supplies one. Idempotent — an instance that
  // already has projects is left alone.
  test.beforeAll(async () => {
    // Direct to the API, so the session cookie does not apply — carry a bearer token when the
    // environment has auth on.
    const ctx = await apiRequest.newContext({ baseURL: API_BASE, extraHTTPHeaders: apiAuthHeaders() });
    try {
      const existing = await ctx.get('/api/v1/projects/projects');
      const rows = existing.ok() ? ((await existing.json()) as unknown[]) : [];
      if (Array.isArray(rows) && rows.length > 0) return;

      const created = await ctx.post('/api/v1/projects/projects', {
        data: { title: `E2E Offline Fixture ${Date.now()}`, status: 'active' },
      });
      // Fail here, loudly, rather than let every test below time out on an empty <select> and
      // leave someone guessing which of the API, the page or the engine was at fault.
      if (!created.ok()) {
        throw new Error(
          `could not create the project fixture (${created.status()} from ${API_BASE}). ` +
            'The offline journey needs at least one project to file a report against.',
        );
      }
    } finally {
      await ctx.dispose();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded' });
    // The page is a client component behind a suspense boundary and takes several seconds to
    // hydrate in dev. Wait for the form itself rather than guessing at a delay — a short fixed
    // wait made every test here skip itself while the page was perfectly fine.
    await page
      .getByPlaceholder('Containment 2nd fix, L3 east')
      .waitFor({ state: 'visible', timeout: 45_000 })
      .catch(() => {});
  });

  // Leave nothing behind.
  //
  // Playwright gives each test its own context, so in principle this spec's IndexedDB queue,
  // localStorage fallback, service worker and its cache all die with it. "In principle" is doing
  // a lot of work there: this is the one spec that deliberately manufactures a half-finished
  // write and a browser that dies holding it, and the failure mode when that state does escape —
  // a later spec's mutation quietly swallowed by a queue or served from a stale cache-first
  // response — reads as a bug in the *next* file, which is the most expensive kind of flake to
  // chase. The teardown is cheap; wearing it is cheaper than proving every time that the
  // isolation still holds after someone adds a `storageState` or a shared context.
  test.afterEach(async ({ context }) => {
    await context.setOffline(false).catch(() => undefined);

    const open = context.pages().find((p) => !p.isClosed());
    const scratch = open ?? (await context.newPage().catch(() => null));
    if (!scratch) return;

    try {
      // Needs a real origin: storage APIs are unavailable on about:blank.
      if (!scratch.url().startsWith('http')) {
        await scratch.goto(REPORTS_URL, { waitUntil: 'domcontentloaded' });
      }
      await scratch.evaluate(async () => {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase('aura_offline_db');
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
        localStorage.removeItem('aura_offline_fallback_queue');
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      });
    } catch {
      // The context is on its way out regardless — a teardown that throws would mask the real
      // failure of the test it is tearing down.
    }
  });

  test('a report created with no network is queued locally rather than lost', async ({ page, context }) => {
    const desc = `${TAG} queued-while-offline`;
    await fillReport(page, desc);

    await context.setOffline(true);
    await page.getByRole('button', { name: /Add report/i }).click();
    await page.waitForTimeout(1200);

    const queue = await readQueue(page);
    const mine = queue.filter((q) => q.endpoint.includes('daily-reports'));
    expect(mine.length, 'the report should be sitting in IndexedDB, not discarded').toBeGreaterThan(0);
    expect(mine[0].operationId, 'every queued item needs an operation id to dedupe on').toBeTruthy();

    await context.setOffline(false);
  });

  test('reconnecting drains the queue and the server ends up with exactly one', async ({ page, context }) => {
    const desc = `${TAG} drains-once`;
    await fillReport(page, desc);

    await context.setOffline(true);
    await page.getByRole('button', { name: /Add report/i }).click();
    await page.waitForTimeout(1000);
    expect(await serverCount(page, desc), 'nothing should have reached the server yet').toBeLessThanOrEqual(0);

    await context.setOffline(false);
    // The engine drains on reconnect with backoff; give it room without being flaky.
    await expect
      .poll(async () => serverCount(page, desc), { timeout: 30_000, intervals: [500] })
      .toBe(1);

    const queue = await readQueue(page);
    expect(
      queue.filter((q) => q.endpoint.includes('daily-reports') && q.status === 'pending'),
      'a synced item must leave the queue',
    ).toHaveLength(0);
  });

  test('a browser killed mid-sync resumes on reopen and still lands exactly one', async ({ page, context }) => {
    const desc = `${TAG} crash-recovery`;
    await fillReport(page, desc);

    await context.setOffline(true);
    await page.getByRole('button', { name: /Add report/i }).click();
    await page.waitForTimeout(1000);
    expect((await readQueue(page)).length, 'item must be durably queued before the crash').toBeGreaterThan(0);

    // Stage the crash rather than racing it.
    //
    // This used to reconnect and call `page.close()` a beat later, hoping to land inside the
    // in-flight window. That made the test a coin flip on something worse than timing: when the
    // close won, the item was still `pending`, so the reopened session sent it for the very first
    // time and no replay — and therefore no deduplication — was ever exercised. The test only
    // *passed* in the runs where it failed to set up its own scenario.
    //
    // Instead, hold the sync POST open on the client side *after* the server has finished with
    // it. The write commits, the response is dropped on the floor, and the page dies believing
    // nothing happened. That is the one state a client genuinely cannot reason about, and the
    // only one where the server-side idempotency lease is load-bearing.
    //
    // `page.route`, not `context.route`: the interception has to die with this page so it cannot
    // touch the replay the reopened page is about to make.
    await page.route('**/api/site/daily-reports', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      // Let the request complete cleanly at the server before abandoning it. Tearing down a
      // request mid-flight instead leaves the shared dev server logging an aborted stream, which
      // is state this spec would be exporting to whatever runs next.
      await route.fetch();
      // Deliberately never fulfilled.
    });

    await context.setOffline(false);

    // The row landing server-side is the proof the interrupted attempt got through — poll for it
    // rather than sleeping at the race.
    await expect
      .poll(async () => serverCount(page, desc), { timeout: 30_000, intervals: [250] })
      .toBe(1);
    expect(
      (await readQueue(page)).filter((q) => q.endpoint.includes('daily-reports') && q.status === 'syncing'),
      'the kill has to happen with the item mid-flight, or this test proves nothing',
    ).toHaveLength(1);

    await page.close();

    // Same context → same origin storage, so IndexedDB survives exactly as it would a real crash.
    const reopened = await context.newPage();
    await reopened.goto(REPORTS_URL, { waitUntil: 'domcontentloaded' });

    // The point of the whole exercise: the reopened session finds an item stranded in `syncing`,
    // cannot know it already committed, and must replay it. Only the server honouring the
    // repeated Idempotency-Key keeps this at 1 — without the lease (or with a BFF that drops the
    // header on the way through) this reads 2.
    await expect
      .poll(async () => serverCount(reopened, desc), { timeout: 30_000, intervals: [500] })
      .toBe(1);

    // …and stays at 1 once the replay has definitively been made and answered.
    await expect
      .poll(async () => (await readQueue(reopened)).filter((q) => q.endpoint.includes('daily-reports')).length, {
        timeout: 30_000,
        intervals: [500],
      })
      .toBe(0);
    expect(await serverCount(reopened, desc), 'the resumed replay must not create a second row').toBe(1);
  });

  test('the topbar tells the engineer where their data actually is', async ({ page, context }) => {
    // Not cosmetic: the one thing worse than being offline is not knowing whether your report
    // reached the server.
    // Synced is the resting state; prove the indicator is actually mounted before flipping.
    await expect(page.getByText(/Synced|Offline|Pending|Failed/i).first()).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await expect
      .poll(async () => page.locator('body').innerText(), { timeout: 20_000, intervals: [500] })
      .toMatch(/Offline|Pending|📡/i);

    await context.setOffline(false);
    await expect
      .poll(async () => page.locator('body').innerText(), { timeout: 30_000, intervals: [500] })
      .toMatch(/Synced/i);
  });
});
