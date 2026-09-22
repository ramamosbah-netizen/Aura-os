import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { projectFixtureId } from './fixtures';

/**
 * SIT-04 / J4-01 — a photograph goes from the person to storage and back to the person.
 *
 * The finding was that the daily report "displays photos/signature without saving them with the
 * record". Two things were true at once: the screen held the picked files in React state and the
 * save payload had no field for them, AND site had no upload route to send them to — every
 * multipart route in AURA was in CRM or Tendering.
 *
 * This drives the whole loop in a real browser, because that is the only place the finding was
 * ever visible. An API-level proof would have passed against the broken screen.
 *
 *   pick a file in the form  ->  save  ->  it reaches storage  ->  it is on the record  ->
 *   the same bytes come back through the governed download route
 *
 * The file is a REAL PNG rather than a placeholder string: the server judges type from content,
 * so a fake would be refused and the test would prove the refusal instead of the round trip.
 */

// A small but genuine PNG (1x1, white). Decoded in the page so the browser uploads real bytes.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

test.describe('site evidence, end to end', () => {
  test('a photograph picked on the daily report reaches storage and comes back', async ({ page, baseURL }) => {
    const projectId = await projectFixtureId(page.request, baseURL);
    test.skip(!projectId, 'no project fixture — the site API is not running behind the web shell');

    await page.goto('/site/daily-reports', { waitUntil: 'domcontentloaded' });

    // The form only unlocks once a project is chosen, and the attachment zone only renders then —
    // which is itself part of the governed behaviour this screen already had.
    const picker = page.getByTestId('project-picker').or(page.locator('select').first());
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await picker.selectOption(projectId).catch(async () => {
      await picker.click();
      await page.getByRole('option').first().click();
    });

    const marker = `Evidence round trip ${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder('Containment 2nd fix, L3 east').fill(marker);

    // Put a real file into the picker the way a person does.
    await page.setInputFiles('input[type="file"]', {
      name: 'riser-progress.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });

    // The screen shows it as picked. That much always worked — and was the whole problem.
    await expect(page.getByText('riser-progress.png')).toBeVisible({ timeout: 15_000 });

    // ── and the SIGNATURE, which is the other half of the finding ────────────────────────────
    // SIT-04 is "photos AND signature persistence". The canvas emits a PNG data URL and was
    // dropped by the same missing call, so proving only the photo would leave half the record
    // unproven while reading as if it were closed.
    const canvas = page.locator('canvas');
    await expect(canvas, 'exactly one canvas — the signature pad').toHaveCount(1, { timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box, 'the signature canvas must be laid out before it can be signed').toBeTruthy();
    // Events are dispatched ON the element rather than by moving the pointer. React attaches at
    // the root and reads the native event, so a dispatched MouseEvent with real clientX/clientY
    // drives the handlers exactly as a person's hand does — without depending on where the pad
    // happens to sit in the viewport, or on a burst of CDP moves outrunning React's re-render
    // between `setIsDrawing(true)` and the first `draw`.
    const at = (dx: number, dy: number) => ({
      bubbles: true,
      clientX: Math.round(box!.x + dx),
      clientY: Math.round(box!.y + box!.height / 2 + dy),
    });
    await canvas.dispatchEvent('mousedown', at(24, 0));
    for (const [dx, dy] of [[48, -14], [72, 14], [96, -14], [120, 14], [144, 0]] as const) {
      await canvas.dispatchEvent('mousemove', at(dx, dy));
    }
    await canvas.dispatchEvent('mouseup', at(144, 0));
    // The control itself says whether the ink registered: "Clear Signature" only renders once the
    // canvas is non-empty. Asserting it here separates "the signature was never captured" from
    // "the signature was captured and not stored" — two different defects that both end as one
    // missing link on the row.
    await expect(
      page.getByRole('button', { name: /Clear Signature/ }),
      'the canvas must register the ink before anything can be saved',
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Add report' }).click();

    // ── the record now carries the evidence, and the links are the proof it was STORED ────────
    const links = page.getByTestId(/^evidence-link-/);
    await expect(links.first(), 'the saved report must offer the stored evidence back').toBeVisible({ timeout: 45_000 });
    // TWO: the photograph and the signature. One would mean half the record silently dropped,
    // which is indistinguishable from the defect unless the count is asserted.
    await expect(links, 'both the photograph and the signature must be stored').toHaveCount(2, { timeout: 30_000 });

    // ── and the bytes really come back, through the same route the link uses ─────────────────
    for (let i = 0; i < 2; i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href, 'the link must point at the governed download route').toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/content$/);

      const download = await page.request.get(`${baseURL}${href}`);
      expect(download.status(), `downloading stored evidence ${i + 1}`).toBe(200);
      const got = Buffer.from(await download.body());
      expect(got.length, 'an empty body would pass a naive status check').toBeGreaterThan(0);

      // A real image, not an error page or a placeholder: PNG or JPEG, because the picker
      // re-encodes photos to JPEG while the signature canvas emits PNG.
      const isPng = got.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isJpeg = got[0] === 0xff && got[1] === 0xd8 && got[2] === 0xff;
      expect(isPng || isJpeg, `evidence ${i + 1} is not an image (first bytes: ${got.subarray(0, 8).toString('hex')})`).toBe(true);
      // eslint-disable-next-line no-console
      console.log(`  evidence ${i + 1}: ${got.length} bytes, ${isPng ? 'PNG' : 'JPEG'}, sha256 ${createHash('sha256').update(got).digest('hex').slice(0, 16)}…`);
    }

    // The screen no longer holds the picked file: it was saved, so the picker is cleared rather
    // than left showing a thumbnail of something that never left the browser.
    await expect(page.getByText('riser-progress.png')).toBeHidden({ timeout: 15_000 });

    // ── HANDOFF: the next role receives the evidence, not a mention of it ────────────────────
    // A daily report is submitted, reviewed and approved by someone other than its author, and
    // the 360 is where they read it. It used to print the description as plain text: the
    // reviewer could see that a photograph existed and had no way to open it. Evidence nobody
    // downstream can open has not been handed over.
    const reportRow = page.locator('tr', { hasText: marker }).first();
    await expect(reportRow).toBeVisible({ timeout: 15_000 });
    const reportId = (await links.first().getAttribute('data-testid'))!.replace('evidence-link-', '');

    await page.goto(`/site/execution/${reportId}`, { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('tab-evidence');
    await expect(section, 'the 360 must carry the evidence section').toBeVisible({ timeout: 30_000 });
    await expect(section, 'both items must reach the reviewer').toContainText('Evidence (2)');

    const openable = section.getByTestId(/^evidence-open-/);
    await expect(openable, 'each item must be openable by the reviewer').toHaveCount(2, { timeout: 15_000 });
    const reviewerHref = await openable.first().getAttribute('href');
    const reviewerFetch = await page.request.get(`${baseURL}${reviewerHref}`);
    expect(reviewerFetch.status(), 'the reviewer opens the real file').toBe(200);
    expect(Buffer.from(await reviewerFetch.body()).length).toBeGreaterThan(0);

    // ── CONTROLLED OUTPUT: the printable report a client or consultant is given ──────────────
    // XOP-12 asks for the signature to be "included in controlled output", and the daily report
    // page describes itself as backing "progress claims, delay evidence, and client site
    // diaries". So the printable sheet has to carry the day it reports on.
    await page.goto(`/site/daily-reports/${reportId}/print`, { waitUntil: 'domcontentloaded' });
    const sheet = page.locator('body');
    await expect(sheet, 'the printable report must render at all').toContainText('DAILY SITE REPORT', { timeout: 30_000 });
    await expect(sheet, 'it must carry the work it reports on, not an empty template').toContainText(marker);

    // The CAPTURED signature, not a ruled line beside a signature AURA already holds.
    const printedSignature = page.getByAltText(/^Signature — /);
    await expect(printedSignature, 'the stored signature must appear on the sheet').toBeVisible({ timeout: 15_000 });
    const sigSrc = await printedSignature.getAttribute('src');
    expect(sigSrc, 'it must be the stored file, not a data URL re-sent from the browser')
      .toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/content$/);
    // …and it renders: a broken <img> has naturalWidth 0, which toBeVisible does not catch.
    await expect
      .poll(async () => printedSignature.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The photograph is NAMED on the sheet with who captured it. "3 photos" is not evidence
    // anybody can check a progress claim against.
    await expect(sheet, 'each photograph must be named on the printed diary').toContainText('Evidence —');
    await expect(sheet).toContainText('captured by');

  });
});
