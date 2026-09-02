// AURA OS — the create drawer must survive its own overrides fetch.
//
// Regression cover for a bug that got shipped twice. `FormDrawer` resolves the tenant's Form
// Designer overrides asynchronously and remounts the drawer on the merged schema. Both earlier
// versions keyed that remount on a schema VALUE:
//
//   v1  key on "the fetch resolved"        → every drawer in the app remounted once, for nothing
//   v2  key on `effective !== props.schema` → worse: CreateDrawer rebuilds its schema object on
//                                             every parent render, so the comparison flips true
//                                             repeatedly, at arbitrary moments
//
// A remount resets the drawer's `open` and `values`. The user-visible symptom is the whole point:
// a drawer that closes under you and discards what you typed. In CI it surfaced as
// "element is not stable … element was detached from the DOM" mid-click.
//
// This forces the race deterministically by holding the overrides response back until the drawer is
// open and filled, rather than hoping the timing lines up.
import { expect, test } from '@playwright/test';

const RUN = Date.now().toString().slice(-6);

test('an open drawer survives a late overrides response, keeping what was typed', async ({ page, baseURL }) => {
  const probe = await page.request.get(`${baseURL}/api/crm/accounts`).catch(() => null);
  test.skip(probe === null || probe.status() === 502 || probe.status() === 404, 'API not running behind the web shell');

  // Hold every Form Designer lookup open. The drawer renders immediately; the response — and the
  // remount decision that used to follow it — lands only after we have typed into the form.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/forms/**/overrides', async (route) => {
    await held;
    // 404 is the ordinary "this tenant has customised nothing" answer.
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/crm/leads', { waitUntil: 'domcontentloaded' });

  const title = `E2E drawer survives ${RUN}`;
  await page.getByTestId('create-opportunity').click();

  const drawer = page.getByTestId('drawer-opportunity');
  await expect(drawer).toBeVisible();
  await drawer.getByTestId('field-title').fill(title);

  // Now let the overrides land. Under either old version this is where the drawer was torn down.
  release();

  // Still open, and still holding the typed value.
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('field-title')).toHaveValue(title);

  // And it still works: the form submits and the record reaches the register.
  await drawer.getByTestId('submit-opportunity').click();
  await expect(drawer).toBeHidden();

  await page.getByTestId('pipeline-tab-list').click();
  await expect(page.getByTestId('opportunities-list')).toContainText(title);
});
