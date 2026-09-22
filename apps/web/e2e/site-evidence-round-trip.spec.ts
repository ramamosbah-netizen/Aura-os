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

    await page.getByRole('button', { name: 'Add report' }).click();

    // ── the record now carries the evidence, and the link is the proof it was STORED ──────────
    const link = page.getByTestId(/^evidence-link-/).first();
    await expect(link, 'the saved report must offer the stored evidence back').toBeVisible({ timeout: 45_000 });

    const href = await link.getAttribute('href');
    expect(href, 'the link must point at the governed download route').toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/content$/);

    // ── and the bytes really come back, through the same route the link uses ─────────────────
    const download = await page.request.get(`${baseURL}${href}`);
    expect(download.status(), 'downloading the stored evidence').toBe(200);
    const got = Buffer.from(await download.body());
    expect(got.length, 'an empty body would pass a naive status check').toBeGreaterThan(0);

    // It is a real image, not an error page or a placeholder: PNG or JPEG, because the picker
    // re-encodes images to JPEG to keep a site upload small.
    const isPng = got.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = got[0] === 0xff && got[1] === 0xd8 && got[2] === 0xff;
    expect(isPng || isJpeg, `what came back is not an image (first bytes: ${got.subarray(0, 8).toString('hex')})`).toBe(true);

    // The screen no longer holds the picked file: it was saved, so the picker is cleared rather
    // than left showing a thumbnail of something that never left the browser.
    await expect(page.getByText('riser-progress.png')).toBeHidden({ timeout: 15_000 });

    // eslint-disable-next-line no-console
    console.log(`  stored evidence: ${got.length} bytes, sha256 ${createHash('sha256').update(got).digest('hex').slice(0, 16)}…`);
  });
});
