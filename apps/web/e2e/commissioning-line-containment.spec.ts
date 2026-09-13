import { expect, test, type Locator } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * Long lines stay inside their row.
 *
 * The gate rows are the worst case: a reason is a full sentence — "No drawings on this project carry
 * a discipline this system recognises (cctv, elv, security)" — and there are ten gates per system.
 * Left alone they made every row a different height, and a grid child defaults to `min-width: auto`,
 * so a long unbroken string widens its own track instead of shrinking.
 *
 * Asserted on the COMPUTED style rather than by eye, and on both sections that render `GateList`,
 * because the containment lives in shared components: "it should also apply to pre-commissioning" is
 * a claim worth checking rather than assuming.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const H = () => apiAuthHeaders();

const styleOf = (el: Locator, prop: string) =>
  el.evaluate((node, p) => getComputedStyle(node as Element).getPropertyValue(p).trim(), prop);

/** Does the element render wider than the box it sits in? That is the failure being prevented. */
const overflowsParent = (el: Locator) =>
  el.evaluate((node) => {
    const child = node as HTMLElement;
    const parent = child.parentElement as HTMLElement | null;
    if (!parent) return false;
    return child.getBoundingClientRect().width > parent.getBoundingClientRect().width + 1;
  });

test('gate reasons and system titles are contained, in both sections that show them', async ({ page, baseURL }) => {
  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `CX Containment ${run}`, baseURL);

  const created = await page.request.post(CX, {
    headers: H(),
    data: {
      projectId,
      code: `LC-${run}`,
      // Deliberately long: a title that fits proves nothing about a title that does not.
      title: 'CCTV — Tower A, levels B2 through 47, including the podium, the annexe and the external perimeter cameras',
      system: 'cctv',
    },
  });
  test.skip(!created.ok(), 'commissioning API not reachable');

  for (const section of ['pre-commissioning', 'readiness'] as const) {
    await page.goto(`/commissioning?project=${encodeURIComponent(projectId)}&section=${section}`, { waitUntil: 'domcontentloaded' });

    const prefix = section === 'readiness' ? `readiness-gate-LC-${run}` : `pre-gate-LC-${run}`;

    // BOTH sections are collapsed by default — four gate rows per card in pre-commissioning, ten in
    // readiness, which buried the titles you scan to find a system. The gates are the detail behind
    // a disclosure, so each card is opened before its rows can be measured.
    const gatesBefore = page.locator(`[data-testid^="${prefix}-"]`);
    await expect(gatesBefore, `${section}: collapsed by default — the card shows its title, not its gates`).toHaveCount(0);

    const disclosure = page.getByTestId(`${section === 'readiness' ? 'readiness' : 'pre'}-open-LC-${run}`);
    await expect(disclosure, `${section}: the caret is live once React has attached`).toBeEnabled();
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

    const firstGate = page.locator(`[data-testid^="${prefix}-"]`).first();
    await expect(firstGate, `${section} renders its gates`).toBeVisible();

    const reason = firstGate.locator('small').first();
    expect(await styleOf(reason, '-webkit-line-clamp'), `${section}: the reason is clamped, not cut to one line`).toBe('2');
    expect(await styleOf(reason, 'overflow'), `${section}: the clamp needs the overflow hidden to take effect`).toContain('hidden');
    expect(await overflowsParent(reason), `${section}: the reason must not widen its own cell`).toBe(false);

    // The full sentence stays reachable — truncation that hides information is the trade this avoids.
    await expect(reason, `${section}: the whole reason is a hover away`).toHaveAttribute('title', /.+/);

    const title = page.locator(`[data-testid="${section === 'readiness' ? 'readiness' : 'pre-system'}-LC-${run}"] strong`).first();
    expect(await styleOf(title, 'text-overflow'), `${section}: a long system title truncates`).toBe('ellipsis');
    expect(await overflowsParent(title), `${section}: and does not push the status tag off the card`).toBe(false);
  }
});
