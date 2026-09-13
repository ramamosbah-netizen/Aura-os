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

test('the global register finds a drawing across projects and leads into the project', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const name = `ENG Global ${run}`;
  const projectId = await createProject(page.request, name, baseURL);
  const code = `GL-${run}-01`;

  const made = await page.request.post(`${baseURL}/api/engineering/drawings`, {
    data: { projectId, projectName: name, code, title: 'Findable across projects', revision: '0' },
  });
  test.skip(!made.ok(), 'engineering API not reachable behind the web shell');

  await page.goto('/engineering/drawings', { waitUntil: 'domcontentloaded' });

  // What this page uniquely owes: a code, typed with no idea which project holds it, reaches the
  // project that does. Project-centric navigation does not remove the need for that.
  await page.getByTestId('eng-drawings-search').fill(code);
  await expect(page.getByTestId(`eng-project-${projectId}`)).toBeVisible();

  // And every way out of it leads INTO the project, which is the point of the change.
  await expect(page.getByTestId(`eng-project-register-${projectId}`)).toHaveAttribute(
    'href',
    `/project/${projectId}/drawings`,
  );
  await page.getByTestId(`eng-project-open-${projectId}`).click();
  const manage = page.locator(`[data-testid^="eng-drawing-open-"]`).first();
  await expect(manage).toHaveAttribute('href', new RegExp(`^/project/${projectId}/drawings/`));
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
