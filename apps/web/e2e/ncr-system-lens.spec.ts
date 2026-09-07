import { expect, test } from '@playwright/test';
import { runId, scoped } from './fixtures';

/**
 * AURA-P360-004 — an NCR carries the ELV system it is against, and the Project 360 lens uses it.
 *
 * Deliberately asserts IDENTITY, not counts.
 *
 * A count is the weaker evidence: "4 records became 3" is satisfied by a filter that drops the
 * wrong row, by an off-by-one, and by any unrelated record arriving or leaving between two reads.
 * Naming which record survives each lens is the claim that actually matters to an engineer — that
 * the CCTV lens shows the CCTV non-conformance and hides the fire-alarm one.
 *
 * The third fixture is the one that is easy to forget. A row with NO system is not "unfiltered
 * data" to be tidied away; `filterAreaRows` keeps it under every lens on purpose, because a
 * non-conformance nobody has attributed yet must not become invisible the moment someone puts a
 * lens on. Every historical NCR is in that state — migration 0282 adds the column as NULL rather
 * than defaulting it — so this is the behaviour that protects existing evidence, and it is
 * asserted three times rather than once.
 */

const RUN = runId();
const CCTV = `NCR-CCTV-${RUN}`;
const FIRE = `NCR-FIRE-${RUN}`;
const LEGACY = `NCR-NULL-${RUN}`;

let projectId = '';

test.beforeAll(async ({ request }) => {
  const created = await request.post('/api/projects/projects', {
    data: { title: scoped('NCR System Lens'), reference: `NSL-${Date.now().toString().slice(-5)}`, status: 'active', value: 50_000 },
  });
  expect(created.ok(), 'project fixture must exist for the lens proof to mean anything').toBe(true);
  projectId = ((await created.json()) as { id: string }).id;

  // One NCR per lens state. `system` omitted entirely for the legacy row — not '' and not 'other',
  // because the point is the shape a pre-0282 record has.
  const raise = async (ncrNumber: string, system?: string) => {
    const res = await request.post('/api/quality/ncrs', {
      data: { projectId, ncrNumber, description: `lens fixture ${ncrNumber}`, severity: 'minor', ...(system ? { system } : {}) },
    });
    expect(res.status(), `${ncrNumber} must be created`).toBe(201);
    return (await res.json()) as { system: string | null };
  };

  // Read-back at the API boundary: the field has to survive the write, or everything below is
  // asserting the filter against data that never stored what the form sent.
  expect((await raise(CCTV, 'cctv')).system).toBe('cctv');
  expect((await raise(FIRE, 'fire-alarm')).system).toBe('fire-alarm');
  expect((await raise(LEGACY)).system).toBeNull();
});

/**
 * Rows the Quality section is showing, by NCR number.
 *
 * Anchored on the section's own regions before reading, NOT retried. Reading `innerText` straight
 * after `domcontentloaded` races the streamed server render: the first version of this helper did
 * that and the three assertions flapped between runs, reporting every record absent — a filter
 * result that was wrong for a reason that had nothing to do with filtering. Waiting for the panels
 * that carry the rows is a readiness anchor the page itself defines; a `toPass` around the
 * assertion would have hidden the same race behind a green tick.
 */
async function visible(page: import('@playwright/test').Page, url: string): Promise<{ cctv: boolean; fire: boolean; legacy: boolean }> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-section-quality')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Quality recent activity' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Quality attention' })).toBeVisible();
  const body = await page.locator('body').innerText();
  return { cctv: body.includes(CCTV), fire: body.includes(FIRE), legacy: body.includes(LEGACY) };
}

test('the Quality section shows every NCR when no lens is on', async ({ page }) => {
  const seen = await visible(page, `/project/${projectId}/workspace/quality`);
  expect(seen).toEqual({ cctv: true, fire: true, legacy: true });
  await expect(page.getByTestId('project-section-lens')).toHaveCount(0);
});

test('the CCTV lens keeps the CCTV NCR and the unattributed one, and drops the fire-alarm NCR', async ({ page }) => {
  const seen = await visible(page, `/project/${projectId}/workspace/quality?discipline=cctv`);
  expect(seen).toEqual({ cctv: true, fire: false, legacy: true });
  await expect(page.getByTestId('project-section-lens')).toBeVisible();
});

test('the fire-alarm lens is the mirror image', async ({ page }) => {
  const seen = await visible(page, `/project/${projectId}/workspace/quality?discipline=fire-alarm`);
  expect(seen).toEqual({ cctv: false, fire: true, legacy: true });
});

/**
 * The journey a person actually performs: raise the NCR through the form, choose a system, save,
 * and find it under that lens and not under another. Everything above starts from an API-seeded
 * fixture, which cannot catch a form that never sends the field it collects.
 */
test('an engineer can raise an NCR against a system and then find it by that lens', async ({ page }) => {
  const number = `NCR-UI-${RUN}`;

  await page.goto('/quality/ncrs', { waitUntil: 'domcontentloaded' });

  // Located through the label ELEMENT rather than by accessible name.
  //
  // This form wraps each control in its <label>, and for a wrapping label the accessible name
  // includes the embedded control's own value — so the name of the system select is
  // "SystemNot attributed", not "System", and an exact getByLabel finds nothing. A substring match
  // would work today and break the moment a second field mentions "Project". The DOM relationship
  // the markup actually uses is the stable thing to drive.
  //
  // Anchored at the START of the label's text, not a substring of it. A plain `hasText: 'System'`
  // matched the PROJECT field here, because this spec's own fixture project is called
  // "NCR System Lens" and a wrapping label's text includes its select's options. The locator was
  // matching on data rather than structure. The fixture keeps that name deliberately: it is a
  // standing regression guard against anyone loosening these locators again.
  const field = (label: string) => page.locator('label').filter({ hasText: new RegExp('^' + label) }).first();
  await field('Project').locator('select').selectOption(projectId);
  await field('NCR number').locator('input').fill(number);
  await field('Description').locator('input').fill('raised through the form, attributed to CCTV');
  await field('System').locator('select').selectOption('cctv');
  await page.getByRole('button', { name: 'Raise NCR', exact: true }).click();

  // Stored, and stored as CCTV — read back through the register rather than trusting the form.
  const row = page.getByRole('row').filter({ hasText: number });
  await expect(row).toBeVisible();
  await expect(row).toContainText('CCTV');

  // And the lens the shell offers finds it, and the other one does not.
  expect(await visible(page, `/project/${projectId}/workspace/quality?discipline=cctv`)).toMatchObject({ legacy: true });
  await expect(page.locator('body')).toContainText(number);

  await page.goto(`/project/${projectId}/workspace/quality?discipline=fire-alarm`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(number);
  // ...while the unattributed NCR is still there, which is what stops a lens hiding evidence.
  await expect(page.locator('body')).toContainText(LEGACY);
});
