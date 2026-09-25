import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { systemFromChecklist } from './approved-checklist';

/**
 * TC-06 / TC-07 — WHOSE WITNESS, WHAT THE TEST PRODUCED, AND WHO EXECUTES IT.
 *
 * TC-06 asks that "witness identity AND AUTHORITY persist on real system test/certificate". The
 * sign-off recorded a name and which side of the sign-off it belonged to — WHO, with WHOSE left
 * unanswered. On a UAE ELV project a consultant's witness, the client's own representative and an
 * authority inspector are three different standings, and a certificate that blurs them is one
 * nobody can rely on a year later.
 *
 * TC-07 is "Witness signature AND ATTACHMENTS", executed by a "Representative T&C Engineer, QA/QC,
 * Design / Technical Engineer role". The signature existed; the attachments did not, because
 * commissioning had no door for a file at all. And the existing signature spec executes as the
 * session user — `u-admin`, an administrator holding every permission in the system, which proves
 * nothing about whether a T&C engineer can do the work.
 *
 * So this signs in AS `u-e2e-tc` under the shipped `r-commissioning-engineer` role and drives the
 * whole thing. NOTHING IS GRANTED TO MAKE IT PASS: if the role cannot reach a step, that is a
 * finding about the role.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

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

test('a T&C engineer attaches test evidence and takes a witnessed sign-off under their own role', async ({ browser, page, baseURL, request }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const projectId = await createProject(page.request, 'TC-06/07 witness role', baseURL);
  test.skip(!projectId, 'commissioning API not reachable behind the web shell');

  const run = Date.now().toString().slice(-6);
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const TC = process.env.E2E_TC_USERNAME ?? 'u-e2e-tc';

  // Seeded by the admin, because a commissioning record belongs to a project and the T&C engineer
  // must be on it. Granted BEFORE they use it — nobody awards themselves access to a project.
  const member = await page.request.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: apiAuthHeaders(),
    data: { userId: TC, roleId: 'r-commissioning-engineer' },
  });
  expect([200, 201, 409].includes(member.status()), `putting the T&C engineer on the project: ${await member.text()}`).toBe(true);

  // Created FROM Quality's approved checklist (TC-08/TC-09), its one point executed and passed.
  const record = await systemFromChecklist(page.request, {
    projectId, code: `CX-W${run}`, title: 'CCTV — witnessed test', system: 'cctv',
    points: [{ code: 'IMG-01', activity: 'Camera image', acceptanceCriteria: 'Image on VMS' }],
  });
  expect(record?.id, 'the fixture record must exist before the screen is driven').toBeTruthy();
  await page.request.post(`${API}/api/v1/commissioning/records/${record.id}/test-items/${record.point('IMG-01').id}/runs`, {
    headers: apiAuthHeaders(), data: { result: 'pass', actual: 'Image on VMS' },
  });

  const context = await browser.newContext({ storageState: undefined });
  const tc = await context.newPage();
  await tc.goto('/login', { waitUntil: 'domcontentloaded' });
  await tc.getByTestId('login-username').fill(TC);
  await tc.getByTestId('login-password').fill(password);
  await tc.getByTestId('login-submit').click();
  await tc.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }).catch(async () => {
    const shown = await tc.getByTestId('login-error').innerText().catch(() => null);
    throw new Error(`sign-in as '${TC}' did not complete${shown ? ` — ${shown}` : ''}`);
  });

  try {
    await tc.goto(`/commissioning/${record.id}`, { waitUntil: 'domcontentloaded' });
    const actions = tc.getByTestId('cx-actions');
    await expect(actions, 'the T&C engineer must be able to reach the sign-off panel').toBeVisible({ timeout: 30_000 });

    // ── WHAT THE TEST PRODUCED, through commissioning's first door for a file ────────────────
    await tc.getByTestId('cx-attachment-file').setInputFiles({
      name: 'fluke-output.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    await expect(tc.getByTestId('cx-attached-count'), 'the attachment must reach storage under this role')
      .toContainText('fluke-output.png', { timeout: 30_000 });

    // ── THE WITNESS SAYS WHOSE WITNESS THEY ARE ─────────────────────────────────────────────
    const engineer = `A. Engineer ${run}`;
    const witness = `R. Consultant ${run}`;
    await tc.getByPlaceholder('Commissioned by').fill(engineer);
    await tc.getByPlaceholder('Witnessed by (consultant/client)').fill(witness);
    await tc.getByTestId('cx-witness-authority').selectOption('consultant');

    const pads = tc.getByTestId('cx-signatures').locator('canvas');
    await expect(pads).toHaveCount(2, { timeout: 15_000 });
    await sign(pads.nth(0));
    await sign(pads.nth(1));
    await expect(
      tc.getByTestId('cx-signatures').getByRole('button', { name: /Clear Signature/ }),
    ).toHaveCount(2, { timeout: 15_000 });

    await tc.getByTestId('btn-commission').click();
    await expect(tc.getByTestId('cx-locked'), 'the T&C engineer signs it off under their own role')
      .toBeVisible({ timeout: 30_000 });

    // ── WHAT THE ROLE ACTUALLY WROTE ────────────────────────────────────────────────────────
    const detail = await (
      await tc.request.get(`${API}/api/v1/commissioning/records/${record.id}/detail`, { headers: apiAuthHeaders() })
    ).json() as {
      record: { status: string; commissionRecordedBy: string | null; witnessedBy: string | null };
      signoffEvidence: Array<{ party: string; signedBy: string; authority: string; recordedBy: string | null; fileId?: string; documentId: string; coverage: string; integrity: string }>;
      attachments: Array<{ category: string; fileId: string; description: string | null; capturedBy: string | null }>;
    };

    expect(detail.record.status).toBe('commissioned');
    expect(detail.record.commissionRecordedBy, 'the sign-off is recorded against the T&C engineer, not an administrator').toBe(TC);

    // TC-06: identity AND authority.
    const witnessRow = detail.signoffEvidence.find((e) => e.party === 'witness')!;
    expect(witnessRow.signedBy, 'the witness is named').toBe(witness);
    expect(witnessRow.authority, 'and says whose witness they are').toBe('consultant');
    expect(witnessRow.recordedBy, 'the recorder is the T&C engineer').toBe(TC);
    expect(witnessRow.recordedBy, 'and is not the signatory').not.toBe(witness);
    expect(witnessRow.integrity, 'the committed version is resolved and verified').toBe('verified');

    // The engineer signs for the contractor by definition — defaulted, not asked.
    expect(detail.signoffEvidence.find((e) => e.party === 'commissioning_engineer')!.authority).toBe('contractor');

    // TC-07: the attachment.
    expect(detail.attachments, 'the test evidence reached storage under this role').toHaveLength(1);
    expect(detail.attachments[0].capturedBy, 'recorded by the engineer who ran the test').toBe(TC);

    // ── SAVE / RELOAD AND DOWNLOAD, under the role that filed it ────────────────────────────
    const attachmentFile = await tc.request.get(`${baseURL}/api/documents/${detail.attachments[0].fileId}/content`);
    expect(attachmentFile.status(), 'the T&C engineer opens the attachment they filed').toBe(200);
    const committed = Buffer.from(await attachmentFile.body());
    expect(committed.length).toBeGreaterThan(0);

    // ── AND IT IS SEALED BY THE SIGN-OFF ────────────────────────────────────────────────────
    //
    // An attachment on a system still under test is working material; the same file on a
    // COMMISSIONED system is part of what the witness signed against. Driven against the generic
    // DMS version route as an administrator, who holds the permission and is still refused.
    const overwrite = await request.post(`${API}/api/v1/documents/${detail.attachments[0].fileId}/versions`, {
      headers: apiAuthHeaders(),
      data: { fileName: 'x.png', contentType: 'image/png', content: 'not what was tested' },
    });
    expect(overwrite.ok(), 'evidence a witness signed against must not be replaceable').toBe(false);
    expect(await overwrite.text()).toMatch(/has been commissioned|cannot be replaced/i);

    // ── ACTUAL OUTPUT ───────────────────────────────────────────────────────────────────────
    await tc.goto(`/commissioning/${record.id}/certificate`, { waitUntil: 'domcontentloaded' });
    const pack = tc.locator('body');
    await expect(pack, 'the evidence pack renders for the T&C engineer').toContainText('TESTING & COMMISSIONING EVIDENCE PACK', { timeout: 30_000 });
    await expect(pack, 'the signatory is named').toContainText(`Signed by ${witness}`);
    await expect(pack, 'and the authority they signed under').toContainText('for the consultant');
    await expect(pack, 'and the recorder as the recorder').toContainText(`recorded in AURA by ${TC}`);
    await expect(pack, 'the attachment is named on the sheet').toContainText('fluke-output.png');
    await expect(pack, 'and the pack no longer claims nothing is attached')
      .not.toContainText('No instrument output, photograph or calibration certificate is attached');

    // ── NEXT-ROLE RECEIPT, AND THE DENIAL ───────────────────────────────────────────────────
    const pmLogin = await request.post(`${API}/api/v1/auth/login`, {
      data: { username: process.env.E2E_PM_USERNAME ?? 'u-e2e-pm', password },
    });
    if (pmLogin.ok()) {
      const pm = { Authorization: `Bearer ${((await pmLogin.json()) as { token: string }).token}` };
      const received = await request.get(`${API}/api/v1/documents/${witnessRow.documentId}/content`, { headers: pm });
      expect(received.status(), 'the next role receives the witness signature, not a mention of it').toBe(200);
      expect(Buffer.from(await received.body()).length).toBeGreaterThan(0);
    }

    const outsiderLogin = await request.post(`${API}/api/v1/auth/login`, {
      data: { username: process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper', password },
    });
    if (outsiderLogin.ok()) {
      const outsider = { Authorization: `Bearer ${((await outsiderLogin.json()) as { token: string }).token}` };
      const refused = await request.get(`${API}/api/v1/documents/${witnessRow.documentId}/content`, { headers: outsider });
      expect(refused.status(), 'a Storekeeper has no commissioning authority and must not open this').toBe(403);
    }
  } finally {
    await context.close();
  }
});
