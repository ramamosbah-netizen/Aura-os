import { expect, type Locator } from '@playwright/test';

/**
 * Click a control and confirm the thing it should reveal actually appeared — re-clicking if the
 * first click was swallowed by hydration.
 *
 * THE ROOT CAUSE this exists for (the "interaction-readiness instability" recorded in the gap
 * register). Every page here server-renders its interactive shell, so a button is present, visible,
 * stable and enabled — everything Playwright's click actionability model checks — BEFORE React
 * attaches its `onClick` during hydration. A click that lands in that window is a real DOM click
 * that fires no React handler and is silently lost: the panel, picker or sub-tab it would open never
 * appears, and the `toBeVisible()` that follows times out. Hydration is CPU-bound (parse + execute
 * the bundle) and `next dev` builds it lazily, so under full-suite load the window widens and the
 * drop happens now and then; run standalone, hydration finishes in a few ms and the same test
 * passes. This is why the three flaky assertions all waited on something revealed by a CLICK and
 * never by navigation (a navigation wait auto-waits for the load; a click-reveal waits on nothing
 * that knows about hydration), and why a content-only test on the same route passed while the
 * click-driven one failed.
 *
 * `waitFor({ state: 'visible' })` is NO guard against this: a server-rendered button is visible
 * immediately, long before it is interactive. The only reliable signal is the effect — so this
 * clicks, checks that the effect landed, and re-clicks until it does.
 *
 * This is not a masked retry of a failing test (the suite runs `retries: 0` deliberately). It is a
 * poll for readiness, the same shape as `toBeVisible()` polling for an element, applied to the
 * click that makes the element appear. Toggle-safe: once `revealed` is showing it never clicks
 * again, so a control that opens on one click and closes on the next is never flipped back shut.
 */
export async function clickToReveal(
  trigger: Locator,
  revealed: Locator,
  opts: { timeout?: number } = {},
): Promise<void> {
  const timeout = opts.timeout ?? 30_000;
  await expect(async () => {
    // Only click while the effect is absent — so a click that already opened `revealed` is never
    // re-issued (which would toggle it shut). A dropped pre-hydration click leaves it absent, so the
    // next attempt clicks again; once the handler is wired, one click lands and the poll settles.
    if (!(await revealed.isVisible())) {
      await trigger.click({ timeout: 2_000 });
    }
    await expect(revealed).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout, intervals: [100, 250, 500, 1_000] });
}
