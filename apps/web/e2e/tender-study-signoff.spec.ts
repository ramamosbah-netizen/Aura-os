import { inflateSync, constants as zlib } from 'node:zlib';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * J1-06 — THE TENDER TECHNICAL STUDY, from its drawings to its sign-off, by the people who own it
 * (STU-03 drawings and specification revisions, STU-06 compliance and deviations, STU-08 study
 * review and sign-off; the upload half of XOP-09).
 *
 *   pre-sales          uploads a real drawing on the tender, adds revision 2, previews it; a file
 *                      that misrepresents itself is refused on screen
 *   pre-sales          assesses a requirement as a DEVIATION, submits — the study reaches the
 *                      Technical Manager's My Work, which it never did before
 *   technical manager  cannot approve a deviation nobody wrote down; returns it with a comment
 *   pre-sales          finds the return in My Work, records the deviation with a disposition,
 *                      saves, reloads, resubmits
 *   technical manager  reads the deviation on the decision screen and approves on screen; the
 *                      item leaves both lists
 *   refused            the author approving, a non-assigned approver, the reviewer uploading, the
 *                      estimator and a viewer reading, a spoofed owner, a foreign document, an
 *                      oversized file
 *   frozen             revision 3 arrives after sign-off; the approved study still opens revision 2
 *   next role          the take-off opens only on the approved study; the technical proposal
 *                      prints the deviation and the evidence revision it rests on
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const USERS = {
  salesmgr: 'u-e2e-salesmgr', presales: 'u-e2e-presales', techmgr: 'u-e2e-techmgr',
  estimator: 'u-e2e-estimator', viewer: 'u-e2e-viewer',
} as const;
type Actor = keyof typeof USERS;
type Headers = Record<string, string>;

async function bearer(request: APIRequestContext, username: string): Promise<Headers | null> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } }).catch(() => null);
  if (!res?.ok()) return null;
  const token = ((await res.json()) as { token?: string }).token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

/** A small, valid one-page PDF — real bytes a viewer can render, not a named text file. */
function drawingPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function pdfText(bytes: Buffer): string {
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    const open = bytes.indexOf('stream', at);
    if (open < 0) break;
    let start = open + 'stream'.length;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const close = bytes.indexOf('endstream', start);
    if (close < 0) break;
    const raw = bytes.subarray(start, close);
    try { parts.push(inflateSync(raw, { finishFlush: zlib.Z_SYNC_FLUSH }).toString('latin1')); } catch { parts.push(raw.toString('latin1')); }
    at = close + 'endstream'.length;
  }
  return parts.join('\n');
}

test.describe('J1-06 — a tender study is drawn up, reviewed and signed off by the people it belongs to', () => {
  test.setTimeout(480_000);

  test('drawing revisions → deviation assessed → reaches the reviewer → returned → recorded → approved → proposal', async ({ browser, request, baseURL }) => {
    test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
    const tokens = {} as Record<Actor, Headers>;
    for (const [actor, username] of Object.entries(USERS) as Array<[Actor, string]>) {
      const t = await bearer(request, username);
      test.skip(!t, `${username} is not provisioned`);
      tokens[actor] = t!;
    }
    const raw = (actor: Actor, method: 'GET' | 'POST', path: string, data?: unknown) =>
      request.fetch(`${API}${path}`, { method, headers: tokens[actor], data });
    const call = async <T>(actor: Actor, method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> => {
      const res = await raw(actor, method, path, data);
      expect(res.ok(), `${actor} ${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
      return (await res.json().catch(() => ({}))) as T;
    };
    const upload = (actor: Actor, path: string, multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) =>
      request.post(`${API}${path}`, { headers: tokens[actor], multipart });
    const run = Date.now().toString().slice(-6);

    for (const [key, value] of [
      ['company.name', 'AURA MEP Systems Test LLC'], ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
      ['company.trn', '100999999999999'], ['company.address', 'Dubai, United Arab Emirates'], ['finance.defaultCurrency', 'AED'],
    ]) {
      const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'J1-06 study sign-off proof' } });
      expect(configured.ok(), await configured.text()).toBe(true);
    }

    const { id: T } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', {
      tenderNumber: `TND-ST-${run}`, title: `Jumeirah Bay Towers — ELV ${run}`, clientName: 'Meraas',
      submissionDeadline: '2026-12-31T00:00:00.000Z', estimatedValue: 0,
    });
    const rev1 = drawingPdf(`CCTV layout ${run} Rev A`);
    const rev2 = drawingPdf(`CCTV layout ${run} Rev B`);
    const rev3 = drawingPdf(`CCTV layout ${run} Rev C`);
    const drawingTitle = `CCTV layout drawing ${run}`;

    // ── STU-03, on screen: Pre-Sales uploads a real drawing, adds revision 2, previews it ────────
    const presales = await seat(browser, baseURL!, USERS.presales);
    await presales.goto(`/tendering/tenders/${T}#study`, { waitUntil: 'domcontentloaded' });
    await expect(presales.getByRole('heading', { name: 'Technical Study' })).toBeVisible({ timeout: 30_000 });
    await presales.getByLabel('Evidence type').selectOption('drawing');
    await presales.getByLabel('Evidence title').fill(`Mislabelled layout ${run}`);
    await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: 'cctv-layout.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is a text file, not a drawing') });
    await presales.getByRole('button', { name: 'Upload study evidence' }).click();
    await expect(presales.locator('p[role="alert"]'), 'a text file named as a PDF drawing is refused on screen').toContainText('a drawing must be pdf, cad or image; this file is', { timeout: 30_000 });

    await presales.getByLabel('Evidence type').selectOption('drawing');
    await presales.getByLabel('Evidence title').fill(drawingTitle);
    await presales.getByLabel('Source file · up to 25 MB').setInputFiles({ name: `cctv-layout-${run}-rev-a.pdf`, mimeType: 'application/pdf', buffer: rev1 });
    await presales.getByRole('button', { name: 'Upload study evidence' }).click();
    await expect(presales.getByText(/Study evidence uploaded and linked to this Tender/)).toBeVisible({ timeout: 30_000 });
    await presales.getByLabel(`Upload a new revision for ${drawingTitle}`).setInputFiles({ name: `cctv-layout-${run}-rev-b.pdf`, mimeType: 'application/pdf', buffer: rev2 });
    await expect(presales.getByText(new RegExp(`Revision 2 uploaded for ${drawingTitle}`))).toBeVisible({ timeout: 30_000 });
    const files = await call<Array<{ id: string; title: string; currentVersion: number; aggregateId: string }>>('presales', 'GET', `/tendering/tenders/${T}/study-files`);
    const drawing = files.find((f) => f.title === drawingTitle)!;
    expect(drawing).toMatchObject({ currentVersion: 2, aggregateId: T });
    expect(files.map((f) => f.title), 'the refused file left nothing behind').not.toContain(`Mislabelled layout ${run}`);
    for (const [version, bytes] of [[1, rev1], [2, rev2]] as const) {
      const stored = await presales.request.get(`/api/documents/${drawing.id}/content?version=${version}`);
      expect(stored.status()).toBe(200);
      expect(Buffer.compare(await stored.body(), bytes), `revision ${version} is stored byte for byte`).toBe(0);
    }

    // ── STU-06, on screen: a requirement assessed as a deviation, and nothing written down for it ──
    await presales.getByLabel(`Use ${drawingTitle} in this study revision`).check();
    await presales.getByLabel('Study title').fill(`ELV technical study ${run}`);
    await presales.getByLabel('Input revision').fill('Tender drawings Rev B');
    await presales.getByLabel('Technical reviewer').selectOption(USERS.techmgr);
    await presales.getByLabel('Scope summary').fill('CCTV, access control and structured cabling for two residential towers.');
    await presales.getByLabel('Design basis 1').fill('IP CCTV, 4MP, central NVR');
    await presales.getByLabel('Requirement statement 1').fill('Recording retention of 90 days');
    await presales.getByLabel('Requirement source 1').fill('Spec 4.2');
    await presales.getByLabel('Acceptance criteria 1').fill('90 days at full frame rate');
    await presales.getByLabel('Technical response 1').fill('Offered at 30 days; see the deviation');
    await presales.getByLabel('Compliance 1').selectOption('deviation');
    await presales.getByRole('button', { name: 'Create study draft' }).click();
    await expect(presales.getByText(/S-001 · draft/i)).toBeVisible({ timeout: 30_000 });
    const [study] = await call<Array<{ id: string; evidence: Array<{ documentId: string; revision: string }> }>>('presales', 'GET', `/tendering/tenders/${T}/studies`);
    expect(study.evidence).toEqual([expect.objectContaining({ documentId: drawing.id, revision: '2' })]);

    // The take-off is the next role's, and it waits on an APPROVED study.
    const early = await raw('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, { lines: [{ description: 'IP camera, 4MP dome', unit: 'no', quantity: 120 }] });
    expect(early.status(), 'no take-off rests on an unapproved study').toBe(400);

    await presales.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(presales.getByText(/S-001 · in review/i)).toBeVisible({ timeout: 30_000 });
    await expect(presales.getByText(`Waiting for ${USERS.techmgr}`)).toBeVisible();

    // The disabled button is the screen's courtesy; the refusal is the server's.
    const unready = await raw('techmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'bypassing the screen' });
    expect(unready.status(), 'the assigned reviewer cannot approve an unrecorded deviation through the API either').toBe(409);
    expect(((await unready.json()) as { message: string }).message).toContain('study is not approval-ready: 1 requirement(s) assessed as a deviation have no deviation recorded against their reference');

    // ── STU-08, the receipt: the study is on the Technical Manager's list, and links to itself ────
    const techmgr = await seat(browser, baseURL!, USERS.techmgr);
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const reviewItem = techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(reviewItem).toContainText('Technical study review', { timeout: 30_000 });
    await expect(reviewItem).toContainText(`ELV technical study ${run} · S-001`);
    await reviewItem.getByRole('link', { name: `ELV technical study ${run} · S-001` }).click();
    await expect(techmgr).toHaveURL(new RegExp(`/tendering/tenders/${T}#study`), { timeout: 30_000 });
    await expect(techmgr.getByRole('heading', { name: 'Technical Manager decision' })).toBeVisible({ timeout: 30_000 });
    await expect(techmgr.getByText('1 requirement(s) assessed as a deviation have no deviation recorded against their reference')).toBeVisible();
    await expect(techmgr.getByRole('button', { name: 'Approve technical basis' }), 'a deviation nobody wrote down cannot be approved').toBeDisabled();
    await techmgr.getByPlaceholder('Review comment / decision basis').fill(`Record the retention deviation against Spec 4.2 ${run}`);
    await techmgr.getByRole('button', { name: 'Request changes' }).click();
    await expect(techmgr.getByText('Study returned to the assigned author.')).toBeVisible({ timeout: 30_000 });

    // ── The return reaches the author the same way ─────────────────────────────────────────────
    await presales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const returnedItem = presales.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(returnedItem).toContainText('Technical study returned', { timeout: 30_000 });
    await expect(returnedItem).toContainText(`Returned for changes: Record the retention deviation against Spec 4.2 ${run}`);
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    await expect(techmgr.getByText('Task source coverage')).toBeVisible({ timeout: 30_000 });
    await expect(techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`), 'a returned study is not the reviewer\'s to do').toHaveCount(0);

    await returnedItem.getByRole('link', { name: `ELV technical study ${run} · S-001` }).click();
    await expect(presales).toHaveURL(new RegExp(`/tendering/tenders/${T}#study`), { timeout: 30_000 });
    await presales.getByRole('button', { name: '+ Add deviation' }).click();
    await presales.getByLabel('Deviation requirement reference 1').fill('Spec 4.2');
    await presales.getByLabel('Deviation 1').fill(`Retention limited to 30 days ${run}`);
    await presales.getByLabel('Deviation impact 1').fill('Storage reduced by two thirds');
    await presales.getByLabel('Deviation resolution 1').fill('Client to confirm 30 days or fund extra storage');
    await presales.getByLabel('Deviation disposition 1').selectOption('accepted');
    await presales.getByRole('button', { name: 'Save study draft' }).click();
    await expect(presales.getByText('Draft saved from the current server version.')).toBeVisible({ timeout: 30_000 });
    await presales.reload({ waitUntil: 'domcontentloaded' });
    await expect(presales.getByLabel('Deviation 1'), 'the deviation survives a reload').toHaveValue(`Retention limited to 30 days ${run}`, { timeout: 30_000 });
    await expect(presales.getByLabel('Deviation disposition 1')).toHaveValue('accepted');
    await presales.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(presales.getByText(/S-001 · in review/i)).toBeVisible({ timeout: 30_000 });

    // ── Refused, by the rule that owns each act ─────────────────────────────────────────────────
    expect((await raw('presales', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'self' })).status(), 'the author cannot approve').toBe(403);
    const other = await raw('salesmgr', 'POST', `/tendering/tenders/${T}/studies/${study.id}/approve`, { comment: 'not mine' });
    expect(other.status(), 'an approver who is not the assigned reviewer is refused').toBe(409);
    expect(((await other.json()) as { message: string }).message).toContain('only the assigned reviewer can approve this study');
    expect((await upload('techmgr', `/tendering/tenders/${T}/study-files`, { category: 'drawing', title: 'Reviewer file', file: { name: 'r.pdf', mimeType: 'application/pdf', buffer: rev1 } })).status(), 'the reviewer does not author evidence').toBe(403);
    expect((await raw('estimator', 'GET', `/tendering/tenders/${T}/study-files`)).status(), 'the estimator does not read the study dossier').toBe(403);
    expect((await raw('viewer', 'GET', `/tendering/tenders/${T}/study-files`)).status(), 'a viewer does not read the study dossier').toBe(403);
    const estimatorPage = await seat(browser, baseURL!, USERS.estimator);
    expect((await estimatorPage.request.get(`/api/documents/${drawing.id}/content?version=2`)).status(), 'nor the drawing itself').toBe(403);
    const spoofed = await upload('presales', `/tendering/tenders/${T}/study-files`, {
      category: 'client_specification', title: `Spec ${run}`, aggregateId: '00000000-0000-4000-8000-000000000000',
      file: { name: 'spec.pdf', mimeType: 'application/pdf', buffer: drawingPdf(`Spec ${run}`) },
    });
    expect(spoofed.status()).toBe(201);
    expect(((await spoofed.json()) as { document: { aggregateId: string } }).document.aggregateId, 'a spoofed owner is ignored').toBe(T);
    const { id: T2 } = await call<{ id: string }>('salesmgr', 'POST', '/tendering/tenders', { tenderNumber: `TND-ST2-${run}`, title: `Other tender ${run}`, clientName: 'Other', estimatedValue: 0 });
    const foreign = ((await (await upload('presales', `/tendering/tenders/${T2}/study-files`, { category: 'drawing', title: `Foreign ${run}`, file: { name: 'f.pdf', mimeType: 'application/pdf', buffer: rev1 } })).json()) as { document: { id: string } }).document;
    const crossed = await upload('presales', `/tendering/tenders/${T}/study-files/${foreign.id}/versions`, { file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: rev3 } });
    expect(crossed.status(), 'a revision cannot be filed onto another tender\'s drawing').toBe(400);
    expect(((await crossed.json()) as { message: string }).message).toContain('Study evidence must belong to this tender');
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, 0x20);
    rev1.copy(oversized);
    expect((await upload('presales', `/tendering/tenders/${T}/study-files`, { category: 'drawing', title: 'Too big', file: { name: 'big.pdf', mimeType: 'application/pdf', buffer: oversized } })).status(), 'a file over 25 MB is refused').toBe(413);

    // ── The reviewer reads the deviation where he decides, and approves on screen ────────────────
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    const again = techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`);
    await expect(again).toContainText('Technical study review', { timeout: 30_000 });
    await again.getByRole('link', { name: `ELV technical study ${run} · S-001` }).click();
    const recorded = techmgr.getByRole('table', { name: 'Recorded deviations' });
    await expect(recorded).toContainText('Spec 4.2', { timeout: 30_000 });
    await expect(recorded).toContainText(`Retention limited to 30 days ${run}`);
    await expect(recorded).toContainText('accepted');
    await expect(techmgr.getByText('The study has no unresolved technical blockers.')).toBeVisible();
    await techmgr.getByPlaceholder('Review comment / decision basis').fill('Deviation recorded and disposed; basis approved.');
    await techmgr.getByRole('button', { name: 'Approve technical basis' }).click();
    await expect(techmgr.getByText('Technical basis approved for quantity take-off and estimating.')).toBeVisible({ timeout: 30_000 });
    await techmgr.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    await expect(techmgr.getByText('Task source coverage')).toBeVisible({ timeout: 30_000 });
    await expect(techmgr.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`), 'a decided study leaves the list').toHaveCount(0);
    await presales.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
    await expect(presales.getByText('Task source coverage')).toBeVisible({ timeout: 30_000 });
    await expect(presales.locator(`[data-testid="work-item"][data-task-id="${study.id}"]`)).toHaveCount(0);

    // ── Frozen: revision 3 arrives after sign-off; the approved study still opens revision 2 ─────
    const late = await upload('presales', `/tendering/tenders/${T}/study-files/${drawing.id}/versions`, { note: 'Client issued Rev C', file: { name: `cctv-layout-${run}-rev-c.pdf`, mimeType: 'application/pdf', buffer: rev3 } });
    expect(late.status(), await late.text()).toBe(201);
    await techmgr.goto(`/tendering/tenders/${T}#study`, { waitUntil: 'domcontentloaded' });
    await expect(techmgr.getByText('frozen revision 2')).toBeVisible({ timeout: 30_000 });
    await techmgr.getByRole('button', { name: 'Open frozen revision' }).click();
    await expect(techmgr).toHaveURL(new RegExp(`/documents/${drawing.id}/pdf\\?version=2`), { timeout: 30_000 });
    await expect(techmgr.getByText(`cctv-layout-${run}-rev-b.pdf · Version 2`), 'the preview names the frozen revision, not the latest').toBeVisible({ timeout: 30_000 });
    await expect(techmgr.getByTitle(`PDF preview: ${drawingTitle}`)).toHaveAttribute('src', new RegExp(`/api/documents/${drawing.id}/content\\?version=2&inline=true`));
    const frozen = await techmgr.request.get(`/api/documents/${drawing.id}/content?version=2`);
    expect(Buffer.compare(await frozen.body(), rev2), 'the reviewer reads the revision he approved').toBe(0);

    // ── The next role: the take-off opens on the approved study, and the proposal prints it ──────
    const takeoff = await call<{ id: string }>('presales', 'POST', `/tendering/tenders/${T}/quantity-takeoff`, { lines: [{ description: 'IP camera, 4MP dome', unit: 'no', quantity: 120 }] });
    await call('techmgr', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/approve`);
    await call('estimator', 'POST', `/tendering/tenders/${T}/quantity-takeoff/${takeoff.id}/project-to-boq`);
    const sales = await seat(browser, baseURL!, USERS.salesmgr);
    const proposal = await sales.request.get(`/api/tendering/tenders/${T}/technical-proposal.pdf`);
    expect(proposal.status(), await proposal.text().catch(() => '')).toBe(200);
    const text = pdfText(await proposal.body());
    for (const printed of ['Deviations', `Retention limited to 30 days ${run}`, 'Spec 4.2', 'Recording retention of 90 days', drawingTitle, `ELV technical study ${run}`, 'S-001', 'input Tender drawings Rev B']) {
      expect(text, `the technical proposal prints: ${printed}`).toContain(printed);
    }
  });
});
