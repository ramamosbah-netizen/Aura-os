import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * Engineering and Quality registers are shown a page at a time — the same twenty as T&C.
 *
 * Asserted on the three surfaces named, and on what makes paging safe rather than merely present:
 * the row pushed off page one is still REACHABLE, the count tells the truth, and a register with
 * no filter of its own has a way to find a known drawing without clicking Next twenty times.
 *
 * The drawing register is the case worth spelling out. It had no filter at all, so paging it made
 * a known drawing findable only by paging to it. The search box is part of the change, not a
 * flourish on top of it — and it is asserted here because a pager without it is a regression.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const H = () => apiAuthHeaders();
const PAGE_SIZE = 20;

test.setTimeout(240_000);

test('the drawing register pages, and search reaches what paging pushed off', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `ENG Paging ${run}`, baseURL);

  // Codes chosen so the sort — live drawings by code — puts a known one LAST. The register sorts
  // alphabetically, so `ZZ` is the row that page one cannot hold, whatever else is in the register.
  const total = PAGE_SIZE + 1;
  const first = await page.request.post(`${baseURL}/api/engineering/drawings`, {
    data: { projectId, projectName: `ENG Paging ${run}`, code: `AA-${run}-01`, title: 'Drawing 01' },
  });
  test.skip(!first.ok(), 'engineering API not reachable behind the web shell');
  for (let n = 2; n < total; n += 1) {
    await page.request.post(`${baseURL}/api/engineering/drawings`, {
      data: { projectId, projectName: `ENG Paging ${run}`, code: `AA-${run}-${String(n).padStart(2, '0')}`, title: `Drawing ${n}` },
    });
  }
  const lastCode = `ZZ-${run}-99`;
  await page.request.post(`${baseURL}/api/engineering/drawings`, {
    data: { projectId, projectName: `ENG Paging ${run}`, code: lastCode, title: 'The one at the end' },
  });

  await page.goto(`/engineering/drawings?projectId=${encodeURIComponent(projectId)}`, { waitUntil: 'domcontentloaded' });

  const rows = page.getByTestId('drawing-register').locator('tbody tr');
  await expect(rows, 'a full page, not the whole register').toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId('drawing-register-pager-info')).toContainText(`1–${PAGE_SIZE} of ${total}`);
  await expect(page.getByTestId('drawing-register')).not.toContainText(lastCode);

  await page.getByTestId('drawing-register-pager-next').click();
  await expect(rows, 'the remainder, not a second full page').toHaveCount(total - PAGE_SIZE);
  await expect(page.getByTestId('drawing-register'), 'page two holds it').toContainText(lastCode);
  await expect(page.getByTestId('drawing-register-pager-next')).toBeDisabled();

  // And without paging to it at all: the point of the search box.
  await page.getByTestId('drawing-register-pager-prev').click();
  await page.getByTestId('drawing-register-search').fill(lastCode);
  await expect(page.getByTestId('drawing-register')).toContainText(lastCode);
  await expect(page.getByTestId('drawing-register-count')).toContainText(`1 of ${total}`);
  await expect(page.getByTestId('drawing-register-pager'), 'one match needs no pager').toHaveCount(0);

  // A search that matches nothing says so, and says how big the register is — rather than showing
  // an empty table that reads like the register itself is empty.
  await page.getByTestId('drawing-register-search').fill(`no-such-drawing-${run}`);
  await expect(page.getByTestId('drawing-register-no-match')).toContainText(`${total}`);
});

/**
 * The engineering workspace DRAWINGS section is no longer a flat list of drawings — it groups by
 * project and pages the projects. Its paging therefore lives with the rest of that behaviour, in
 * engineering-drawings-by-project.spec.ts, rather than being asserted here against a shape that no
 * longer exists. The other engineering registers keep the pagers added with this change.
 */
test('the quality registers page at twenty', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `QA Paging ${run}`, baseURL);

  // The NCR register is the one every project accumulates, so it is the one asserted.
  const ncr = await page.request.post(`${API}/api/v1/quality/ncrs`, {
    headers: H(),
    data: { projectId, ncrNumber: `NCR-PG-${run}`, description: 'Raised to fill the register', severity: 'minor', system: 'cctv' },
  });
  expect(ncr.ok(), `quality must accept the NCR — ${await ncr.text()}`).toBe(true);

  await page.goto('/quality/control?section=ncrs', { waitUntil: 'domcontentloaded' });
  const qaPager = page.getByTestId('qa-ncrs-pager-info');
  // A tenant with twenty or fewer NCRs renders no pager at all, and that is correct rather than a
  // failure — so the assertion is conditional on there being more than one page, and says which.
  // The NCR table must be on screen either way — without that this whole test passes on a page
  // that failed to render.
  await expect(page.getByTestId('qa-ncrs')).toBeVisible();
  const rendered = await page.getByTestId('qa-ncrs').locator('tbody tr').count();
  expect(rendered, 'the seeded NCR is on screen').toBeGreaterThan(0);
  if ((await qaPager.count()) === 0) {
    // No pager is the right answer for a register that fits — but only if it really does fit.
    expect(rendered, 'no pager, so the register must be at most one page long').toBeLessThanOrEqual(PAGE_SIZE);
  } else {
    expect(rendered, 'a pager means a full page is shown').toBe(PAGE_SIZE);
    await expect(qaPager).toContainText(`1–${PAGE_SIZE} of `);
    await page.getByTestId('qa-ncrs-pager-next').click();
    await expect(qaPager).toContainText(`${PAGE_SIZE + 1}–`);
  }
});
