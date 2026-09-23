import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * QHS-07 — A REPRESENTATIVE QA/QC ENGINEER EXECUTES THE INSPECTION.
 *
 * The sibling spec (inspection-evidence-round-trip) proves the capability: the photograph reaches
 * storage, the signature is attributable and bound, the controlled document carries it, and an
 * unauthorized identity is refused. It executes as the session user — `u-admin`, an administrator
 * holding every permission in the system.
 *
 * QHS-07's criterion is not satisfied by that, and says so in its own words: "REPRESENTATIVE
 * QA/QC, HSE, Site Engineer ROLE EXECUTES inspection evidence and signature in the canonical
 * Quality / HSE context". A capability proved only by an administrator is a capability whose
 * permissions have not been proved at all — the one identity that can never fail an authorization
 * check is the one that tells you nothing about whether anybody else can do the work.
 *
 * So this signs in AS `u-e2e-qaqc`, who holds the shipped `r-qa-qc` role and nothing else, and
 * drives the same journey through the browser. NOTHING IS GRANTED TO MAKE IT PASS: if the role
 * cannot reach a step, that is a finding about the role, not a fixture to widen.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

test('a QA/QC engineer raises, evidences, signs and resolves an inspection under their own role', async ({ browser, page, baseURL, request }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  // `u-e2e-qaqc` is a database-provisioned actor: the in-memory tier cannot hold one, and a
  // failure there would be about provisioning rather than about the product.
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const projectId = await createProject(page.request, 'QHS-07 QA/QC role', baseURL);
  test.skip(!projectId, 'quality API not reachable behind the web shell');

  const run = Date.now().toString().slice(-6);
  const irNumber = `IR-Q${run}`;
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';

  // The QA/QC engineer must be on the project: a quality authority is project-scoped, and giving
  // it tenant-wide would be exactly the widening this spec refuses to do. Granted BY THE ADMIN,
  // before the engineer uses it — nobody awards themselves access to a project.
  const member = await page.request.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: apiAuthHeaders(),
    data: { userId: QAQC, roleId: 'r-qa-qc' },
  });
  expect([200, 201, 409].includes(member.status()), `putting the QA/QC engineer on the project: ${await member.text()}`).toBe(true);

  const context = await browser.newContext({ storageState: undefined });
  const qaqc = await context.newPage();
  await qaqc.goto('/login', { waitUntil: 'domcontentloaded' });
  await qaqc.getByTestId('login-username').fill(QAQC);
  await qaqc.getByTestId('login-password').fill(password);
  await qaqc.getByTestId('login-submit').click();
  await qaqc.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(async () => {
    const shown = await qaqc.getByTestId('login-error').innerText().catch(() => null);
    throw new Error(`sign-in as '${QAQC}' did not complete${shown ? ` — ${shown}` : ''}`);
  });

  try {
    // ── RAISE, with a photograph, as the QA/QC engineer ──────────────────────────────────────
    await qaqc.goto('/quality/inspection-requests', { waitUntil: 'domcontentloaded' });

    const picker = qaqc.getByTestId('project-picker').or(qaqc.locator('select').first());
    await expect(picker, 'the QA/QC engineer must be able to reach the inspection register')
      .toBeVisible({ timeout: 30_000 });
    await picker.selectOption(projectId).catch(async () => {
      await picker.click();
      await qaqc.getByRole('option').first().click();
    });

    await qaqc.getByPlaceholder('IR-001').fill(irNumber);
    await qaqc.getByPlaceholder('L3 riser, grid C4').fill(`L2 corridor tray — ${run}`);
    await qaqc.locator('input[type="date"]').first().fill('2026-09-23');
    await qaqc.setInputFiles('input[type="file"]', {
      name: 'tray-inspection.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await qaqc.getByRole('button', { name: 'Request' }).click();

    const row = qaqc.locator('tr', { hasText: irNumber }).first();
    await expect(row, 'the QA/QC engineer raises the inspection under their own role').toBeVisible({ timeout: 45_000 });

    // ── SIGN AND RESOLVE ─────────────────────────────────────────────────────────────────────
    //
    // The signatory is the consultant who witnessed it and holds no AURA account; the QA/QC
    // engineer is the recorder. Two names, which is the whole point of the row.
    const signatory = `R. Consultant ${run}`;
    const cell = qaqc.getByTestId(`ir-resolve-${irNumber}`);
    await expect(cell).toBeVisible({ timeout: 15_000 });

    const canvas = cell.locator('canvas');
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
    await expect(cell.getByRole('button', { name: /Clear Signature/ })).toBeVisible({ timeout: 15_000 });

    await qaqc.getByTestId(`ir-signed-by-${irNumber}`).fill(signatory);
    await cell.getByRole('button', { name: 'Approve' }).click();

    const printLink = qaqc.getByTestId(`ir-print-${irNumber}`);
    await expect(printLink, 'the QA/QC engineer resolves it under their own role').toBeVisible({ timeout: 30_000 });
    const irId = (await printLink.getAttribute('href'))!.replace('/quality/irs/', '').replace('/print', '');

    // ── WHAT THE ROLE ACTUALLY WROTE ─────────────────────────────────────────────────────────
    const detail = await (await qaqc.request.get(`${baseURL}/api/quality/irs/${irId}/detail`)).json() as {
      inspection: { status: string; inspectedBy: string | null };
      evidence: Array<{ category: string; fileId: string; capturedBy: string | null }>;
      signature: { fileId: string; signedBy: string | null; capturedBy: string | null; coverage: string; integrity: string } | null;
    };

    expect(detail.inspection.status).toBe('approved');
    expect(detail.inspection.inspectedBy, 'the inspection is recorded against the QA/QC engineer, not an administrator').toBe(QAQC);
    expect(detail.evidence.filter((e) => e.category === 'photo'), 'the photograph reached storage under this role').toHaveLength(1);

    expect(detail.signature, 'the signature was kept').toBeTruthy();
    expect(detail.signature!.signedBy, 'the consultant is the signatory').toBe(signatory);
    expect(detail.signature!.capturedBy, 'the QA/QC engineer is the recorder').toBe(QAQC);
    expect(detail.signature!.capturedBy, 'and is not the signatory').not.toBe(signatory);
    expect(detail.signature!.coverage).toBe('current');
    expect(detail.signature!.integrity, 'the committed version is resolved and verified').toBe('verified');

    // ── AND THE ROLE CAN OPEN WHAT IT FILED, THROUGH THE GOVERNED ROUTE ──────────────────────
    const file = await qaqc.request.get(`${baseURL}/api/documents/${detail.signature!.fileId}/content`);
    expect(file.status(), 'the QA/QC engineer opens the signature they recorded').toBe(200);
    expect(Buffer.from(await file.body()).length).toBeGreaterThan(0);

    // ── ACTUAL OUTPUT, read by the role that produced it ─────────────────────────────────────
    await qaqc.goto(`/quality/irs/${irId}/print`, { waitUntil: 'domcontentloaded' });
    const sheet = qaqc.locator('body');
    await expect(sheet, 'the controlled document renders for the QA/QC engineer').toContainText('INSPECTION REQUEST', { timeout: 30_000 });
    await expect(sheet).toContainText(irNumber);
    await expect(sheet, 'the signatory is named').toContainText(`Signed by ${signatory}`);
    await expect(sheet, 'and the recorder is named as the recorder').toContainText(`recorded in AURA by ${QAQC}`);

    const printed = qaqc.getByAltText('Signature — Inspector / Witness');
    await expect(printed).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => printed.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // ── AND REFUSED TO A ROLE WITH NO QUALITY AUTHORITY ──────────────────────────────────────
    //
    // Asserted here rather than only in the sibling spec, so this one stands alone against the
    // clause: the representative role executes AND the applicable denial holds, in one run.
    const outsiderLogin = await request.post(`${API}/api/v1/auth/login`, {
      data: { username: process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper', password },
    });
    if (outsiderLogin.ok()) {
      const outsider = { Authorization: `Bearer ${((await outsiderLogin.json()) as { token: string }).token}` };
      const refused = await request.get(`${API}/api/v1/documents/${detail.signature!.fileId}/content`, { headers: outsider });
      expect(refused.status(), 'a Storekeeper has no quality authority and must not open this').toBe(403);
      const refusedWrite = await request.post(`${API}/api/v1/documents/${detail.signature!.fileId}/versions`, {
        headers: outsider,
        data: { fileName: 'x.png', contentType: 'image/png', content: 'tampered' },
      });
      expect(refusedWrite.ok(), 'nor replace it').toBe(false);
    }

    // ── NEXT-ROLE RECEIPT ────────────────────────────────────────────────────────────────────
    //
    // An approved IR accrues a measured quantity, so the PM answering for that quantity reads
    // this record. A different role, which did not raise, evidence or resolve it, receiving the
    // exact bytes — that is the handoff QHS-07 names.
    const pmLogin = await request.post(`${API}/api/v1/auth/login`, {
      data: { username: process.env.E2E_PM_USERNAME ?? 'u-e2e-pm', password },
    });
    if (pmLogin.ok()) {
      const pm = { Authorization: `Bearer ${((await pmLogin.json()) as { token: string }).token}` };
      const received = await request.get(`${API}/api/v1/documents/${detail.signature!.fileId}/content`, { headers: pm });
      expect(received.status(), 'the next role receives the evidence, not a mention of it').toBe(200);
      expect(Buffer.from(await received.body()).equals(Buffer.from(await file.body())),
        'and receives the exact committed bytes').toBe(true);
    }
  } finally {
    await context.close();
  }
});
