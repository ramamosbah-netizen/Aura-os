import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

/**
 * QHS-07 / XOP-12 — AN INSPECTION REQUEST THAT KEEPS WHAT IT WAS APPROVED ON.
 *
 * Quality had no upload route. Every multipart door in AURA was in CRM, Tendering, DocControl and
 * Site, so a QA engineer could photograph an installation and had nowhere to put the photograph —
 * and the "Inspector / Witness Signature" pad on the screen was bound to React state that the
 * submit payload never read. An inspection request, which is what a consultant signs and what a
 * measured quantity accrues against, recorded a status and an actor and nothing else.
 *
 * This drives the whole loop in a browser, because that is the only place the finding was visible:
 * an API-level proof passes against the broken screen.
 *
 *   photograph picked in the form -> stored -> attached to the IR
 *   the decision is signed, by somebody who is not the person recording it
 *   the signature is bound to the RESULT, and the controlled document shows it
 *   somebody who may not read the IR is refused the file
 */

// A small but genuine PNG. The server judges type from content, so a fake would be refused and
// this would prove the refusal instead of the round trip.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

/** A token for a named test actor, or null when this tier cannot hold them. */
async function mintToken(
  req: import('@playwright/test').APIRequestContext,
  username: string,
): Promise<Record<string, string> | null> {
  const res = await req
    .post(`${API}/api/v1/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } })
    .catch(() => null);
  if (!res?.ok()) return null;
  const token = ((await res.json()) as { token?: string }).token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

test.describe('inspection evidence, end to end', () => {
  test('a photograph and a signature reach the inspection and its controlled document', async ({ page, baseURL }) => {
    const projectId = await projectFixtureId(page.request, baseURL);
    test.skip(!projectId, 'no project fixture — the quality API is not running behind the web shell');

    const run = Date.now().toString().slice(-6);
    const irNumber = `IR-J${run}`;

    await page.goto('/quality/inspection-requests', { waitUntil: 'domcontentloaded' });

    const picker = page.getByTestId('project-picker').or(page.locator('select').first());
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.selectOption(projectId).catch(async () => {
      await picker.click();
      await page.getByRole('option').first().click();
    });

    await page.getByPlaceholder('IR-001').fill(irNumber);
    await page.getByPlaceholder('L3 riser, grid C4').fill(`L3 riser, grid C4 — ${run}`);
    await page.locator('input[type="date"]').first().fill('2026-09-22');

    // ── THE PHOTOGRAPH, picked the way a person does ─────────────────────────────────────────
    await page.setInputFiles('input[type="file"]', {
      name: 'riser-inspection.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    // The screen shows it as picked. That much always worked — and was the whole problem.
    await expect(page.getByText('riser-inspection.png')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Request' }).click();

    const row = page.locator('tr', { hasText: irNumber }).first();
    await expect(row, 'the raised inspection must appear on the register').toBeVisible({ timeout: 45_000 });

    // ── THE DECISION IS SIGNED ───────────────────────────────────────────────────────────────
    //
    // The signatory is deliberately NOT an AURA account: an inspection is witnessed by a
    // consultant who holds no user here, and the person entering the decision is the recorder.
    const signatory = `R. Consultant ${run}`;
    const resolveCell = page.getByTestId(`ir-resolve-${irNumber}`);
    await expect(resolveCell).toBeVisible({ timeout: 15_000 });

    const canvas = resolveCell.locator('canvas');
    await expect(canvas, 'the decision must offer a signature pad').toHaveCount(1, { timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box, 'the pad must be laid out before it can be signed').toBeTruthy();
    const at = (dx: number, dy: number) => ({
      bubbles: true,
      clientX: Math.round(box!.x + dx),
      clientY: Math.round(box!.y + box!.height / 2 + dy),
    });
    await canvas.dispatchEvent('mousedown', at(20, 0));
    for (const [dx, dy] of [[44, -12], [68, 12], [92, -12], [116, 12], [140, 0]] as const) {
      await canvas.dispatchEvent('mousemove', at(dx, dy));
    }
    await canvas.dispatchEvent('mouseup', at(140, 0));
    await expect(
      resolveCell.getByRole('button', { name: /Clear Signature/ }),
      'the canvas must register the ink before anything can be saved',
    ).toBeVisible({ timeout: 15_000 });

    // Refused before it is sent: a signature recorded against whoever entered it is not
    // attributable to the person who gave it.
    await resolveCell.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Name the person who signed this inspection/i),
      'a signature with nobody\'s name on it must be refused').toBeVisible({ timeout: 15_000 });

    await page.getByTestId(`ir-signed-by-${irNumber}`).fill(signatory);
    await resolveCell.getByRole('button', { name: 'Approve' }).click();

    // ── THE RECORD KEEPS BOTH, AND KEEPS THEM APART ──────────────────────────────────────────
    const printLink = page.getByTestId(`ir-print-${irNumber}`);
    await expect(printLink, 'a resolved inspection must offer its controlled document').toBeVisible({ timeout: 30_000 });
    const irId = (await printLink.getAttribute('href'))!.replace('/quality/irs/', '').replace('/print', '');

    const detail = await (await page.request.get(`${baseURL}/api/quality/irs/${irId}/detail`)).json() as {
      inspection: { status: string; inspectedBy: string | null };
      evidence: Array<{ category: string; fileId: string; capturedBy: string | null; signedBy: string | null }>;
      signature: { fileId: string; signedBy: string | null; capturedBy: string | null; coverage: string } | null;
    };

    expect(detail.inspection.status).toBe('approved');
    // BOTH artefacts: the photograph quality could not store, and the signature it discarded.
    expect(detail.evidence.filter((e) => e.category === 'photo'),
      'the picked photograph must have reached storage').toHaveLength(1);
    expect(detail.signature, 'the signature must be kept, not discarded').toBeTruthy();

    // WHO SIGNED is not WHO RECORDED IT.
    expect(detail.signature!.signedBy).toBe(signatory);
    expect(detail.signature!.capturedBy, 'the recorder is the AURA user, never the signatory')
      .not.toBe(signatory);
    expect(detail.signature!.capturedBy, 'and the record knows who entered it').toBeTruthy();
    // BOUND TO THE RESULT: what the consultant put their name to is this decision.
    expect(detail.signature!.coverage).toBe('current');

    // ── THE BYTES COME BACK, THROUGH THE GOVERNED ROUTE ──────────────────────────────────────
    for (const e of detail.evidence) {
      const file = await page.request.get(`${baseURL}/api/documents/${e.fileId}/content`);
      expect(file.status(), `${e.category} must open for somebody who may read the inspection`).toBe(200);
      const got = Buffer.from(await file.body());
      expect(got.length, 'an empty body would pass a naive status check').toBeGreaterThan(0);
      const isPng = got.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isJpeg = got[0] === 0xff && got[1] === 0xd8 && got[2] === 0xff;
      expect(isPng || isJpeg, `${e.category} is not an image (first bytes: ${got.subarray(0, 8).toString('hex')})`).toBe(true);
    }

    // …AND ARE REFUSED to somebody who may not read the inspection. An approved IR accrues a
    // measured quantity, so who can open what it rests on is not a detail.
    const outsider =
      (await mintToken(page.request, process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer')) ??
      (await mintToken(page.request, process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper'));
    if (outsider) {
      const refused = await page.request.get(`${API}/api/v1/documents/${detail.signature!.fileId}/content`, { headers: outsider });
      expect(refused.status(), 'somebody who cannot read the inspection must not open its signature').toBe(403);
      const body = await refused.text();
      for (const leak of ['storageKey', 'storage_key', 'checksum', 'inspection-signature']) {
        expect(body, `a refusal must not disclose ${leak}`).not.toContain(leak);
      }
    }

    // ── CONTROLLED OUTPUT: the inspection request as a document ──────────────────────────────
    //
    // There was no printable IR at all. QHS-07 asks for "actual output" and XOP-12 for the
    // signature to be included in it — neither can be met by a record that is only a table row.
    await page.goto(`/quality/irs/${irId}/print`, { waitUntil: 'domcontentloaded' });
    const sheet = page.locator('body');
    await expect(sheet, 'the inspection request must render as a document').toContainText('INSPECTION REQUEST', { timeout: 30_000 });
    await expect(sheet, 'it must carry the inspection it reports on').toContainText(irNumber);

    const printed = page.getByAltText('Signature — Inspector / Witness');
    await expect(printed, 'the signature must appear on the document').toBeVisible({ timeout: 15_000 });
    expect(await printed.getAttribute('src'), 'and be fetched through the governed route')
      .toContain(`/api/documents/${detail.signature!.fileId}/content`);
    // …and it renders: a broken <img> has naturalWidth 0, which toBeVisible does not catch.
    await expect
      .poll(async () => printed.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // WHO SIGNED and WHO RECORDED IT are separate clauses on the document.
    await expect(sheet, 'the document names the signatory').toContainText(`Signed by ${signatory}`);
    await expect(sheet, 'and names the recorder as the recorder').toContainText('recorded in AURA by');
    // The note states what is held rather than claiming a signed inspection unconditionally.
    await expect(sheet).toContainText('The signature of the person who signed this inspection is held');
    await expect(sheet, 'nothing may call a signed inspection unsigned').not.toContainText('NO SIGNATURE IS HELD');
    // The photograph is NAMED, with who recorded it.
    await expect(sheet, 'each photograph must be named on the document').toContainText('Evidence —');
    await expect(sheet).toContainText('recorded by');
  });
});
