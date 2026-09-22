import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * XOP-12 — A PERSON CAN SIGN A WITNESSED SIGN-OFF, ON THE SCREEN.
 *
 * The API, the store and the evidence pack have carried a sign-off's signatures since XOP-12's
 * T&C slice. No screen offered a pad. So the capability existed and nobody could reach it: every
 * sign-off made through the product printed "Recorded for … with no signature on file" —
 * truthfully, and uselessly.
 *
 * The journey spec drives `commission` over HTTP, which proves the act and says nothing about
 * whether a person can perform it. This drives the shipped screen: the pads are drawn on, the
 * button is pressed, and the signatures are asserted on the record and on the controlled output.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

/** Draw on a pad the way a hand does — dispatched on the element so React's handlers see it. */
async function sign(canvas: import('@playwright/test').Locator): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box, 'the pad must be laid out before it can be signed').toBeTruthy();
  const at = (dx: number, dy: number) => ({
    bubbles: true,
    clientX: Math.round(box!.x + dx),
    clientY: Math.round(box!.y + box!.height / 2 + dy),
  });
  await canvas.dispatchEvent('mousedown', at(18, 0));
  for (const [dx, dy] of [[40, -10], [62, 10], [84, -10], [106, 10], [128, 0]] as const) {
    await canvas.dispatchEvent('mousemove', at(dx, dy));
  }
  await canvas.dispatchEvent('mouseup', at(128, 0));
}

test('a witnessed sign-off is signed on the commissioning screen, by two named parties', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC signature UI', baseURL);
  test.skip(!projectId, 'commissioning API not reachable behind the web shell');
  const run = Date.now().toString().slice(-6);

  // A system with no test points commissions on the screen without a test sheet in the way: what
  // is being proved here is the SIGNATURE CONTROL, and the readiness gates have their own specs.
  const record = await (
    await page.request.post(`${API}/api/v1/commissioning/records`, {
      headers: apiAuthHeaders(),
      data: { projectId, code: `CX-UI${run}`, title: 'CCTV — signature UI', system: 'cctv' },
    })
  ).json() as { id: string; code: string };
  expect(record?.id, 'the fixture record must exist before the screen is driven').toBeTruthy();

  await page.goto(`/commissioning/${record.id}`, { waitUntil: 'domcontentloaded' });

  const actions = page.getByTestId('cx-actions');
  await expect(actions, 'the sign-off panel must render').toBeVisible({ timeout: 30_000 });

  // ── THE NAMES ARE REQUIRED, not defaulted ──────────────────────────────────────────────────
  //
  // This used to send `by || 'Engineer'` and `witness || 'Consultant'`, so pressing the button
  // with both boxes empty recorded two people by those names as having signed.
  await page.getByTestId('btn-commission').click();
  await expect(page.getByTestId('cx-error'), 'an unnamed sign-off must be refused').toContainText(
    /Name the engineer signing off and the witness/i,
    { timeout: 15_000 },
  );

  const engineer = `A. Engineer ${run}`;
  const witness = `R. Consultant ${run}`;
  await page.getByPlaceholder('Commissioned by').fill(engineer);
  await page.getByPlaceholder('Witnessed by (consultant/client)').fill(witness);

  // ── BOTH PADS, on the screen a person actually uses ────────────────────────────────────────
  const pads = page.getByTestId('cx-signatures').locator('canvas');
  await expect(pads, 'a pad per party').toHaveCount(2, { timeout: 15_000 });
  await sign(pads.nth(0));
  await sign(pads.nth(1));
  await expect(
    page.getByTestId('cx-signatures').getByRole('button', { name: /Clear Signature/ }),
    'both pads must register their ink before anything is sent',
  ).toHaveCount(2, { timeout: 15_000 });

  await page.getByTestId('btn-commission').click();

  // The panel locks once the record is commissioned — the screen's own statement that the act
  // landed, rather than a status we infer.
  await expect(page.getByTestId('cx-locked'), 'the sign-off must complete').toBeVisible({ timeout: 30_000 });

  // ── WHAT REACHED THE RECORD ────────────────────────────────────────────────────────────────
  const detail = await (
    await page.request.get(`${API}/api/v1/commissioning/records/${record.id}/detail`, { headers: apiAuthHeaders() })
  ).json() as {
    record: { status: string; commissionRecordedBy: string | null };
    signoffEvidence: Array<{ party: string; signedBy: string; method: string; recordedBy: string | null; coverage: string; integrity: string }>;
  };

  expect(detail.record.status).toBe('commissioned');
  expect(detail.signoffEvidence, 'both parties signed on the screen').toHaveLength(2);

  const forParty = (p: string) => detail.signoffEvidence.find((e) => e.party === p)!;
  expect(forParty('commissioning_engineer').signedBy).toBe(engineer);
  expect(forParty('witness').signedBy).toBe(witness);

  // WHO SIGNED is not WHO RECORDED IT — the names came from the form, the recorder from the
  // session, and neither stands in for the other.
  expect(forParty('witness').recordedBy, 'the recorder is the signed-in user').toBeTruthy();
  expect(forParty('witness').recordedBy, 'and is not the signatory').not.toBe(witness);
  expect(detail.record.commissionRecordedBy, 'the sign-off itself has an actor').toBeTruthy();

  // The method is DECLARED by the screen rather than inferred from the file, the signature is
  // bound to the result it was given for, and the stored bytes are the ones committed to.
  expect(forParty('witness').method).toBe('electronic');
  expect(forParty('witness').coverage).toBe('current');
  expect(forParty('witness').integrity, 'the committed version is resolved and verified').toBe('verified');

  // ── AND IT REACHES THE CONTROLLED OUTPUT ───────────────────────────────────────────────────
  await page.goto(`/commissioning/${record.id}/certificate`, { waitUntil: 'domcontentloaded' });
  const witnessImage = page.getByAltText('Signature — Witness (Consultant / Client)');
  await expect(witnessImage, 'the pack must show what was signed on the screen').toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => witnessImage.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect(page.locator('body')).toContainText(`Signed by ${witness}`);
  await expect(page.locator('body'), 'the pack no longer says nothing was signed')
    .not.toContainText('NO WITNESS EVIDENCE IS HELD');
});
