import { expect, test, type APIRequestContext } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * J1-06 / XOP-09 — THE TENDER STUDY'S UPLOADS ARE SCANNED BY CLAMAV, CENTRALLY AND FAIL-CLOSED.
 *
 * Against the running API, PostgreSQL and the local ClamAV daemon (CLAMAV_HOST/CLAMAV_PORT), on the
 * tender route's study screen, by Pre-Sales:
 *
 *   infected   the EICAR test file, under a category that accepts text, is refused ON SCREEN with the
 *              scanner's signature named, and is not among the study's files
 *   clean      an ordinary specification note is stored, listed and downloads byte-identical
 *
 * The unreachable-scanner refusal is proved against the API (virus-scanning.e2e-spec.ts): a browser
 * run cannot stop the daemon it shares. The EICAR file is assembled at run time so this source file
 * is not itself flagged.
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''), 'latin1');

async function bearer(request: APIRequestContext, username: string): Promise<Record<string, string>> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
  expect(res.ok(), `${username} must sign in`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

test('J1-06 — a tender study upload is scanned: the EICAR file is refused on screen, a clean file is stored', async ({ browser, request, baseURL }) => {
  test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
  test.setTimeout(240_000);
  const run = Date.now().toString().slice(-6);
  const salesmgr = await bearer(request, 'u-e2e-salesmgr');
  const presalesApi = await bearer(request, 'u-e2e-presales');
  const created = await request.post(`${API}/tendering/tenders`, {
    headers: salesmgr,
    data: { tenderNumber: `TND-AV-${run}`, title: `Scanned uploads ${run}`, clientName: 'Meraas', submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0 },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id: T } = (await created.json()) as { id: string };

  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const presales = await context.newPage();
  expect(await signInAs(presales, baseURL!, 'u-e2e-presales'), 'u-e2e-presales signs in').toBe(true);
  await presales.goto(`/tendering/tenders/${T}#study`, { waitUntil: 'domcontentloaded' });
  await expect(presales.getByRole('heading', { name: 'Technical Study' })).toBeVisible({ timeout: 30_000 });

  // ── The EICAR test file, under a category that accepts text, is refused by the scanner ──────
  await presales.getByLabel('Evidence type').selectOption('client_specification');
  await presales.getByLabel('Evidence title').fill(`Infected note ${run}`);
  await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: 'eicar-test.txt', mimeType: 'text/plain', buffer: EICAR });
  await presales.getByRole('button', { name: 'Upload study evidence' }).click();
  await expect(presales.locator('p[role="alert"]')).toContainText('cannot be stored: the virus scanner found', { timeout: 30_000 });
  await expect(presales.locator('p[role="alert"]')).toContainText(/EICAR/i);

  // ── An ordinary specification note is stored and reads back byte-identical ──────────────────
  const note = Buffer.from(`Client specification ${run}: 4MP cameras, 30 days retention.\n`, 'utf8');
  await presales.getByLabel('Evidence type').selectOption('client_specification');
  await presales.getByLabel('Evidence title').fill(`Specification note ${run}`);
  await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: `spec-${run}.txt`, mimeType: 'text/plain', buffer: note });
  await presales.getByRole('button', { name: 'Upload study evidence' }).click();
  await expect(presales.getByText(/Study evidence uploaded and linked to this Tender/)).toBeVisible({ timeout: 30_000 });

  const files = (await (await request.get(`${API}/tendering/tenders/${T}/study-files`, { headers: presalesApi })).json()) as Array<{ id: string; title: string }>;
  expect(files.map((f) => f.title)).toContain(`Specification note ${run}`);
  expect(files.map((f) => f.title), 'the infected file was never stored').not.toContain(`Infected note ${run}`);
  const stored = files.find((f) => f.title === `Specification note ${run}`)!;
  const download = await request.get(`${API}/documents/${stored.id}/content`, { headers: presalesApi });
  expect(download.ok(), await download.text()).toBe(true);
  expect(Buffer.compare(await download.body(), note)).toBe(0);
  await context.close();
});
