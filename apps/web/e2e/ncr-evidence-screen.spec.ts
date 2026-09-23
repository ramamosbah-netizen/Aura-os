import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * QHS-03, ON THE SCREEN A PERSON ACTUALLY USES — and in the document the NCR is issued as.
 *
 * ncr-independent-verification.spec.ts proves the CAPABILITY: three people, both evidence stages,
 * escalation, the seal. It proves all of it over HTTP. That is the half of the claim that can be
 * true while nobody can reach the act — the "QA / Inspector Sign-off" pad had been on this screen
 * since it existed, bound to React state the submit payload never read, and every API test in the
 * world would have passed against it.
 *
 * So this run presses the buttons: picks a photograph, draws on the pad, names the signatory, sets
 * the date the correction is due, and asserts that what the SCREEN sent is what the record holds.
 * Then it reads the NCR as the document it is issued as, which did not exist — the record lived
 * only as a table row inside AURA, and an NCR that cannot leave AURA cannot be issued to the
 * subcontractor who has to correct the work.
 *
 * AND IT DOES ALL OF IT AS THE QA/QC ENGINEER, signed in under `r-qa-qc` and nothing else, because
 * the clause says "QA/QC RAISES an evidenced NCR" and a screen driven by an administrator — the
 * one identity that can never fail an authorization check — proves nothing about whether the
 * person whose job it is can reach it.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

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

test('a QA/QC engineer evidences and dates an NCR on the screen, and it issues as a document', async ({ browser, page, baseURL, request }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  // `u-e2e-qaqc` is a database-provisioned actor: the in-memory tier cannot hold one, and a
  // failure there would be about provisioning rather than about the product.
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const projectId = await createProject(page.request, 'QHS-03 evidence on the screen', baseURL);
  test.skip(!projectId, 'quality API not reachable behind the web shell');

  const run = Date.now().toString().slice(-6);
  const ncrNumber = `NCR-UI${run}`;
  const signatory = `A. Foreman ${run}`;
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';

  // A quality authority is project-scoped, and granting it tenant-wide would be exactly the
  // widening this refuses to do. Granted BY THE ADMIN, before the engineer uses it.
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
    await qaqc.goto(`/quality/ncrs?projectId=${projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(
      qaqc.getByRole('heading', { name: 'Raise NCR' }),
      'the QA/QC engineer must be able to reach the NCR register',
    ).toBeVisible({ timeout: 30_000 });

    await qaqc.getByPlaceholder('NCR-001').fill(ncrNumber);
    await qaqc.getByPlaceholder('Cable tray not per spec').fill('Tray supports at 1.5m; specification requires 1.2m');

    // ── A PHOTOGRAPH OF THE THING THAT WAS WRONG ─────────────────────────────────────────────
    //
    // The picker has always accepted one. Nothing sent it: there was no NCR attachment route at
    // all, so a non-conformance could carry no evidence of the non-conformance.
    await qaqc.setInputFiles('input[type="file"]', {
      name: 'tray-supports.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    await expect(
      qaqc.getByText('tray-supports.png'),
      'the screen shows it picked — which always worked, and was the whole problem',
    ).toBeVisible({ timeout: 15_000 });

    // ── THE PAD, AND THE NAME THAT MAKES IT ATTRIBUTABLE ─────────────────────────────────────
    await sign(qaqc.locator('canvas').first());
    await expect(
      qaqc.getByRole('button', { name: /Clear Signature/ }),
      'the pad must register its ink before anything is sent',
    ).toBeVisible({ timeout: 15_000 });

    // Signed, and nobody named. Refused on the screen, in front of the person still looking at
    // the pad — not accepted and then silently attributed to whoever was signed in.
    await qaqc.getByRole('button', { name: 'Raise NCR' }).click();
    await expect(
      qaqc.getByTestId('ncr-error'),
      'an unnamed signature must be refused where it was drawn',
    ).toContainText(/Name the person who signed/i, { timeout: 15_000 });

    await qaqc.getByTestId('ncr-signed-by').fill(signatory);

    // ── A DATE THE CORRECTION IS DUE AGAINST ─────────────────────────────────────────────────
    //
    // In the PAST deliberately: with no date nothing could ever be late, so "overdue escalation"
    // had nothing to be overdue against and the screen offered no way to give it one.
    await qaqc.getByTestId('ncr-due-at').fill('2020-01-01');

    await qaqc.getByRole('button', { name: 'Raise NCR' }).click();
    await expect(qaqc.getByText(ncrNumber).first(), 'the NCR must reach the register').toBeVisible({ timeout: 30_000 });

    // ── WHAT THE SCREEN ACTUALLY SENT ────────────────────────────────────────────────────────
    //
    // Read back by the ADMIN rather than by the engineer who just did it, so what is asserted
    // below is what the system holds and not what one session happens to be showing.
    const list = await (
      await page.request.get(`${API}/api/v1/quality/ncrs?projectId=${projectId}`, { headers: apiAuthHeaders() })
    ).json() as Array<{ id: string; ncrNumber: string; raisedBy: string | null }>;
    const raised = list.find((n) => n.ncrNumber === ncrNumber);
    expect(raised?.id, 'the NCR the screen raised').toBeTruthy();
    expect(raised!.raisedBy, 'raised by the QA/QC engineer, not by an administrator').toBe(QAQC);

    const detail = await (
      await page.request.get(`${API}/api/v1/quality/ncrs/${raised!.id}/detail`, { headers: apiAuthHeaders() })
    ).json() as {
      ncr: { dueAt: string | null; status: string };
      evidence: Array<{ stage: string; category: string; signedBy: string | null; capturedBy: string | null; integrity?: string }>;
      evidenced: { raised: boolean; corrected: boolean };
      overdue: string;
    };

    // The pad's stroke and the picked photograph both left the browser. This is the assertion the
    // HTTP run cannot make: it sends its own bytes, so it can never catch a screen that sends none.
    expect(detail.evidenced.raised, 'the defect is evidenced by what the SCREEN sent').toBe(true);
    const photo = detail.evidence.find((e) => e.category === 'photo');
    const signature = detail.evidence.find((e) => e.category === 'signature');
    expect(photo, 'the picked photograph reached storage').toBeTruthy();
    expect(signature, 'the drawn signature reached storage').toBeTruthy();

    // WHO SIGNED IS NOT WHO RECORDED IT. The name came from the form, the recorder from the
    // session, and the screen never lets one stand in for the other.
    expect(signature!.signedBy, 'the foreman is the signatory').toBe(signatory);
    expect(signature!.capturedBy, 'the QA/QC engineer is the recorder').toBe(QAQC);
    expect(signature!.capturedBy, 'and is not the signatory').not.toBe(signatory);
    // A photograph names no signatory, and the domain refuses one that tries to.
    expect(photo!.signedBy, 'a photograph is not signed by anybody').toBeNull();
    expect(signature!.integrity, 'the committed version is resolved and its checksum checked').toBe('verified');

    // The date the screen set, and what it makes true: this NCR is late.
    expect(detail.ncr.dueAt, 'the due date the screen set').toBeTruthy();
    expect(detail.overdue, 'a past due date on an open NCR is overdue, not on-time').toBe('overdue');

    // ── AND IT ISSUES AS A DOCUMENT ──────────────────────────────────────────────────────────
    //
    // Reached the way a person reaches it, from the register — a document nobody can navigate to
    // is a document that does not exist.
    await qaqc.getByTestId(`ncr-print-${ncrNumber}`).click();
    await expect(qaqc.getByText('NON-CONFORMANCE REPORT'), 'the NCR prints as a controlled document').toBeVisible({ timeout: 30_000 });
    await expect(qaqc.getByText(ncrNumber).first()).toBeVisible();

    // The signature is RENDERED, not merely referenced: a broken <img> under alt text is the same
    // failure as the blank ruled line it replaced.
    const signatureImage = qaqc.getByAltText('Signature — Raised by (QA/QC)');
    await expect(signatureImage).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => signatureImage.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Signed by the foreman, recorded by the account — two clauses, never merged into one.
    const sheet = qaqc.locator('body');
    await expect(sheet).toContainText(`Signed by ${signatory}`);
    await expect(sheet).toContainText(`recorded in AURA by ${QAQC}`);

    // ── WHAT THE SHEET SAYS WHEN IT HAS NOTHING ──────────────────────────────────────────────
    //
    // The case a document is most tempted to soften. This NCR is open and uncorrected, and the
    // sheet states both rather than leaving a ruled line a reader fills in with an assumption.
    await expect(sheet, 'nothing of the repair is held, and the sheet says so').toContainText(
      /No evidence of the correction has been attached yet/i,
    );
    await expect(sheet, 'and it does not pretend somebody corrected it').toContainText(/The correction has not been carried out/i);
    await expect(sheet, 'nor that anybody verified it').toContainText(/Not yet verified/i);
    await expect(sheet, 'a past date on an open NCR is stated as past').toContainText(/PAST ITS AGREED DATE/i);
  } finally {
    await context.close();
  }
});
