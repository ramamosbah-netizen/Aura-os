import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';

/**
 * QHS-03 — AN EVIDENCED NCR, CORRECTED BY ONE PERSON AND VERIFIED BY ANOTHER.
 *
 * "QA/QC raises an EVIDENCED NCR; responsible owner corrects; INDEPENDENT verifier accepts or
 * rejects; OVERDUE ESCALATION and source work linkage persist."
 *
 * Nothing enforced the independence: one account could raise a non-conformance, mark it corrected
 * and close it, and the record would read as though three people had been involved. Nothing
 * carried evidence either — the "QA / Inspector Sign-off" pad on the screen was bound to React
 * state the submit payload never read, and quality had no NCR attachment route at all. And with
 * no due date nothing could be late, so "overdue escalation" had nothing to be overdue against.
 *
 * Driven by the roles that really do it: QA/QC raises and verifies, the site engineer corrects.
 */

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

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

test('an NCR is evidenced when raised, corrected by its owner and verified by somebody else', async ({ page, baseURL, request }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const projectId = await createProject(page.request, 'QHS-03 independent verification', baseURL);
  test.skip(!projectId, 'quality API not reachable behind the web shell');

  const run = Date.now().toString().slice(-6);
  const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';
  /**
   * TWO PEOPLE ON THE SAME SHIPPED ROLE, which is the only way this rule can be demonstrated —
   * the same reason HSE, the QS and the finance controller each have a pair.
   *
   * `quality.ncr.correct` and `quality.ncr.verify` both sit on r-qa-qc, and that is right:
   * independence here is between two PEOPLE, not two job titles. Widening another role to make
   * this pass would be changing authorization to suit a fixture.
   *
   * WORTH RECORDING: `r-site-engineer` — the responsible owner who actually does the remedial
   * work — holds neither permission, so the person who carried out a correction cannot record
   * that they did. That is a finding about the role catalogue, left as one.
   */
  const OWNER = process.env.E2E_QAQC2_USERNAME ?? 'u-e2e-qaqc2';

  for (const [userId, roleId] of [[QAQC, 'r-qa-qc'], [OWNER, 'r-qa-qc']] as const) {
    const res = await page.request.post(`${API}/api/v1/projects/${projectId}/members`, {
      headers: apiAuthHeaders(), data: { userId, roleId },
    });
    expect([200, 201, 409].includes(res.status()), `${userId} on the project: ${await res.text()}`).toBe(true);
  }

  const qaqc = await mintToken(request, QAQC);
  const owner = await mintToken(request, OWNER);
  test.skip(!qaqc || !owner, 'this tier cannot hold the two QA/QC identities the separation needs');

  // ── QA/QC RAISES IT, WITH A DUE DATE AND EVIDENCE ────────────────────────────────────────
  //
  // Dated in the PAST deliberately: an NCR nobody gave a date to cannot be overdue, and the
  // escalation below has to have something real to be late against.
  const raised = await request.post(`${API}/api/v1/quality/ncrs`, {
    headers: qaqc!,
    data: {
      projectId,
      ncrNumber: `NCR-V${run}`,
      description: 'Tray supports at 1.5m; specification requires 1.2m',
      severity: 'major',
      assignedTo: OWNER,
      dueAt: '2020-01-01T00:00:00.000Z',
    },
  });
  expect(raised.ok(), `QA/QC raises the NCR under their own role — ${await raised.text()}`).toBe(true);
  const ncr = await raised.json() as { id: string; ncrNumber: string; raisedBy: string | null };
  expect(ncr.raisedBy, 'recorded against the QA/QC engineer').toBe(QAQC);

  // A SIGNATURE MUST NAME ITS SIGNATORY — the foreman who was shown the defect holds no account.
  const unnamed = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/evidence/upload`, {
    headers: qaqc!,
    multipart: {
      file: { name: 'sig.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
      stage: 'raised', category: 'signature',
    },
  });
  expect(unnamed.status(), 'a signature with nobody\'s name on it must be refused').toBe(400);

  for (const [category, signedBy] of [['photo', undefined], ['signature', `A. Foreman ${run}`]] as const) {
    const up = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/evidence/upload`, {
      headers: qaqc!,
      multipart: {
        file: { name: `defect-${category}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
        stage: 'raised',
        category,
        description: `Non-conformance ${category}`,
        ...(signedBy ? { signedBy } : {}),
      },
    });
    expect(up.ok(), `the ${category} must reach storage — ${await up.text()}`).toBe(true);
  }

  // ── THE RESPONSIBLE OWNER CORRECTS IT ────────────────────────────────────────────────────
  const planned = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/plan`, {
    headers: qaqc!,
    data: { rootCause: 'Supports set out from the wrong datum', correctiveAction: 'Re-fix at 1.2m', assignedTo: OWNER },
  });
  expect(planned.ok(), `planning the correction — ${await planned.text()}`).toBe(true);

  // …and evidences the repair, on its OWN side of the NCR. A photograph of the defect and a
  // photograph of the repair are not interchangeable, and closing an NCR on a picture of the
  // original fault is the confusion the stage prevents.
  const repairPhoto = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/evidence/upload`, {
    headers: owner!,
    multipart: {
      file: { name: 'repair.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
      stage: 'corrected', category: 'photo', description: 'Supports re-fixed at 1.2m',
    },
  });
  expect(repairPhoto.ok(), `the responsible owner evidences the repair — ${await repairPhoto.text()}`).toBe(true);

  const corrected = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/correct`, { headers: owner!, data: {} });
  expect(corrected.ok(), `the responsible owner marks it corrected — ${await corrected.text()}`).toBe(true);
  expect((await corrected.json()).correctedBy, 'recorded against the responsible owner').toBe(OWNER);

  // ── AND MAY NOT VERIFY THEIR OWN REPAIR ──────────────────────────────────────────────────
  //
  // The clause says INDEPENDENT verifier, and nothing enforced it: one account could raise,
  // correct and close, and the record would read as though three people had been involved.
  const selfVerify = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/verify`, {
    headers: owner!, data: { accepted: true, note: 'looks fine to me' },
  });
  expect(selfVerify.ok(), 'the person who did the repair must not sign it off').toBe(false);
  expect(await selfVerify.text()).toMatch(/may not verify it/i);

  // ── OVERDUE ESCALATION, WHICH NEEDED A DATE TO EXIST ─────────────────────────────────────
  const escalated = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/escalate`, {
    headers: qaqc!, data: { reason: 'Past the agreed date; correction outstanding' },
  });
  expect(escalated.ok(), `an overdue NCR can be escalated — ${await escalated.text()}`).toBe(true);

  // …once. A second escalation says nothing the first did not.
  const again = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/escalate`, {
    headers: qaqc!, data: { reason: 'again' },
  });
  expect(again.ok(), 'escalating twice adds nothing').toBe(false);

  // ── THE INDEPENDENT VERIFIER CLOSES IT ───────────────────────────────────────────────────
  const verified = await request.post(`${API}/api/v1/quality/ncrs/${ncr.id}/verify`, {
    headers: qaqc!, data: { accepted: true, note: 'Re-measured at 1.2m; accepted' },
  });
  expect(verified.ok(), `an independent verifier closes it — ${await verified.text()}`).toBe(true);

  // ── WHAT PERSISTED ───────────────────────────────────────────────────────────────────────
  const detail = await (await request.get(`${API}/api/v1/quality/ncrs/${ncr.id}/detail`, { headers: qaqc! })).json() as {
    ncr: { status: string; raisedBy: string | null; correctedBy: string | null; verifiedBy: string | null; escalatedAt: string | null; escalatedBy: string | null; escalationReason: string | null };
    evidence: Array<{ stage: string; category: string; fileId: string; capturedBy: string | null; signedBy: string | null }>;
    evidenced: { raised: boolean; corrected: boolean };
    overdue: string;
  };

  expect(detail.ncr.status).toBe('closed');
  // THREE DIFFERENT PEOPLE, which is what the clause is actually about.
  expect(detail.ncr.raisedBy).toBe(QAQC);
  expect(detail.ncr.correctedBy).toBe(OWNER);
  expect(detail.ncr.verifiedBy).toBe(QAQC);
  expect(detail.ncr.correctedBy, 'the corrector is not the verifier').not.toBe(detail.ncr.verifiedBy);

  // BOTH SIDES EVIDENCED, reported independently — an NCR with a photograph of the defect and
  // nothing of the repair is in a different state from one with neither.
  expect(detail.evidenced).toEqual({ raised: true, corrected: true });
  const signature = detail.evidence.find((e) => e.category === 'signature')!;
  expect(signature.signedBy, 'the foreman is the signatory').toBe(`A. Foreman ${run}`);
  expect(signature.capturedBy, 'the QA/QC engineer is the recorder, and is not the signatory').toBe(QAQC);

  // THE ESCALATION PERSISTS, and survives the NCR being closed afterwards — it is recorded
  // rather than derived, so it does not disappear when the state moves on.
  expect(detail.ncr.escalatedAt).toBeTruthy();
  expect(detail.ncr.escalatedBy).toBe(QAQC);
  expect(detail.ncr.escalationReason).toContain('Past the agreed date');
  // …and a closed NCR is never reported as overdue. It is finished, whatever date it finished after.
  expect(detail.overdue).toBe('closed');

  // ── AND THE EVIDENCE IS GOVERNED ─────────────────────────────────────────────────────────
  //
  // The responsible owner, who did not upload the QA/QC signature, can still open it: evidence
  // inherits the reachability of the NCR, and somebody asked to correct a defect they cannot look
  // at is not being asked to correct anything.
  const asOwner = await request.get(`${API}/api/v1/documents/${signature.fileId}/content`, { headers: owner! });
  expect(asOwner.status(), 'whoever may read the NCR may open its evidence').toBe(200);

  const outsider = await mintToken(request, process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper');
  if (outsider) {
    const refused = await request.get(`${API}/api/v1/documents/${signature.fileId}/content`, { headers: outsider });
    expect(refused.status(), 'a Storekeeper has no quality authority and must not open this').toBe(403);
  }

  // Sealed once the NCR is closed: the evidence its verification rested on cannot be swapped.
  const overwrite = await request.post(`${API}/api/v1/documents/${signature.fileId}/versions`, {
    headers: apiAuthHeaders(),
    data: { fileName: 'x.png', contentType: 'image/png', content: 'not what was signed' },
  });
  expect(overwrite.ok(), 'evidence a closed NCR rested on must not be replaceable').toBe(false);
  expect(await overwrite.text()).toMatch(/cannot be replaced|has been closed/i);

  // ── AND THE CLOSED NCR ISSUES AS A DOCUMENT ──────────────────────────────────────────────
  //
  // The other half of the sheet. ncr-evidence-screen.spec.ts renders it OPEN, uncorrected and
  // unverified, and asserts it says so; this renders the same document at the other end of the
  // life of an NCR, where a controlled record is most tempted to round its own story up.
  await page.goto(`/quality/ncrs/${ncr.id}/print`, { waitUntil: 'domcontentloaded' });
  const sheet = page.locator('body');
  await expect(page.getByText('NON-CONFORMANCE REPORT')).toBeVisible({ timeout: 30_000 });

  // BOTH SIDES EVIDENCED, and the sheet names each item on the side it evidences — a photograph
  // of the defect is not a photograph of the fix, and a reader who cannot tell them apart is
  // looking at a closed NCR with no way to check what closed it.
  await expect(sheet, 'the defect is evidenced').toContainText(/Evidence of the non-conformance is held/i);
  await expect(sheet, 'and so is the repair').toContainText(/Evidence of the correction is held/i);
  await expect(sheet).toContainText(/Evidence \(the non-conformance\)/i);
  await expect(sheet).toContainText(/Evidence \(the correction\)/i);

  // THE CLAUSE ITSELF, printed: verified by somebody other than the person who did the repair.
  await expect(sheet, 'the independence is stated on the document, not only enforced in the domain')
    .toContainText(/verified by somebody other than the person who carried it out/i);
  await expect(sheet).toContainText(`${OWNER}`);
  await expect(sheet).toContainText(/not the person who carried out the correction/i);

  // The escalation survives onto the sheet with its reason — recorded rather than derived, so
  // closing the NCR afterwards does not erase that it went past its date.
  await expect(sheet, 'the escalation is on the issued document').toContainText(/Escalated — Past the agreed date/i);

  // The signature names the FOREMAN and the QA/QC engineer as separate clauses.
  await expect(sheet).toContainText(`Signed by A. Foreman ${run}`);
  await expect(sheet).toContainText(`recorded in AURA by ${QAQC}`);
});
