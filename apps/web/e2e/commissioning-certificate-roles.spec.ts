// AURA OS — TC-10: the controlled certificate, by the roles that own each part of it. Auth ON, PostgreSQL.
//
// commissioning-certificate-link.spec.ts proves the mechanism — the two guards, the printed pack,
// the dossier, supersession — driven as an administrator. What it cannot say is whether the people
// whose job this is can do it, and whether the people whose job it is not are kept out. Here:
//
//   register   the Document Controller registers the certificate in the controlled register
//   link       the T&C Engineer says, on screen, that this entry IS the system's certificate; it
//              survives a reload, and the printed pack cites it
//   refused    QA/QC and the Design / Technical Engineer, who read commissioning records, may not
//              link or withdraw a certificate (403)
//   receipt    Handover / FM finds it cited in the handover dossier; the Design / Technical Engineer
//              reads the printed pack citing it
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { bindToChecklist } from './approved-checklist';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const H = () => apiAuthHeaders();
const CCTV_POINTS = [{ code: 'IMG-01', activity: 'Camera image', acceptanceCriteria: 'Image on VMS' }];

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('the certificate is registered by Document Control, linked by T&C, refused to others, and reaches the dossier', async ({ browser, baseURL, page, request }) => {
  test.setTimeout(360_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the roles in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');
  const tokenOf = async (username: string) => {
    const res = await request.post(`${API}/api/v1/auth/login`, { data: { username, password: memberPassword() } });
    expect(res.ok(), `${username} login`).toBe(true);
    return { 'content-type': 'application/json', Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
  };

  // ── A SYSTEM SIGNED OFF AGAINST ITS APPROVED CHECKLIST (setup, proved in its own specs) ───────────
  const projectId = await createProject(page.request, 'TC-10 Roles', baseURL);
  const stamp = Date.now().toString().slice(-6);
  const code = `TC10-${stamp}`;
  const created = await request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Podium', system: 'cctv' } });
  expect(created.ok(), await created.text()).toBe(true);
  const system = (await created.json()) as { id: string };
  const point = (await bindToChecklist(request, { recordId: system.id, projectId, system: 'cctv', points: CCTV_POINTS }))('IMG-01');
  await request.post(`${CX}/${system.id}/test-items/${point.id}/runs`, { headers: H(), data: { result: 'pass', actual: 'Image on VMS' } });
  const signed = await request.put(`${CX}/${system.id}/commission`, { headers: H(), data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' } });
  expect(signed.ok(), await signed.text()).toBe(true);

  // ── DOCUMENT CONTROL REGISTERS THE CERTIFICATE ──────────────────────────────────────────────────
  const doccon = await tokenOf('u-e2e-doccon');
  const registered = await request.post(`${API}/api/v1/doccontrol/register`, {
    headers: doccon,
    data: { projectId, documentNumber: `CX-CERT-${stamp}`, title: 'CCTV commissioning certificate — Podium', discipline: 'elv', docType: 'document', currentRevision: 'A', status: 'for_review' },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const doc = (await registered.json()) as { id: string; documentNumber: string };

  // ── OTHERS WHO READ COMMISSIONING MAY NOT SAY WHICH DOCUMENT IS THE CERTIFICATE ─────────────────
  for (const username of ['u-e2e-qaqc', 'u-e2e-eng']) {
    const res = await request.post(`${CX}/${system.id}/certificate-link`, { headers: await tokenOf(username), data: { documentId: doc.documentNumber } });
    expect(res.status(), `${username} must not link a certificate`).toBe(403);
  }

  const tc = await seat(browser, baseURL!, 'u-e2e-tc');
  const fm = await seat(browser, baseURL!, 'u-e2e-fm');
  const eng = await seat(browser, baseURL!, 'u-e2e-eng');
  try {
    // ── THE T&C ENGINEER LINKS IT, ON SCREEN ──────────────────────────────────────────────────────
    await tc.goto(`/commissioning?project=${projectId}&section=certificates`, { waitUntil: 'domcontentloaded' });
    await expect(tc.getByTestId(`certificate-issue-${code}`)).toHaveText('evidence pack only', { timeout: 60_000 });
    await expect(async () => {
      await tc.getByTestId(`certificate-ref-${code}`).fill(doc.documentNumber);
      await tc.getByTestId(`certificate-link-btn-${code}`).click();
      await expect(tc.getByTestId(`certificate-issue-${code}`)).toContainText(`${doc.documentNumber} rev A`, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    // It survives a reload.
    await tc.reload({ waitUntil: 'domcontentloaded' });
    await expect(tc.getByTestId(`certificate-issue-${code}`)).toContainText(`${doc.documentNumber} rev A`, { timeout: 60_000 });

    // QA/QC may not withdraw what T&C registered — refused by the route's permission, before any lookup.
    const withdraw = await request.delete(`${CX}/${system.id}/certificate-link/00000000-0000-0000-0000-000000000000`, { headers: await tokenOf('u-e2e-qaqc') });
    expect(withdraw.status(), 'QA/QC must not withdraw a certificate').toBe(403);
    await tc.reload({ waitUntil: 'domcontentloaded' });
    await expect(tc.getByTestId(`certificate-issue-${code}`)).toContainText(`${doc.documentNumber} rev A`, { timeout: 60_000 });

    // ── THE PRINTED PACK CITES ITS DOCUMENT ───────────────────────────────────────────────────────
    await tc.goto(`/commissioning/${system.id}/certificate`, { waitUntil: 'domcontentloaded' });
    await expect(tc.locator('body')).toContainText(new RegExp(`registered in the controlled register as ${doc.documentNumber}`, 'i'), { timeout: 60_000 });

    // ── THE DESIGN / TECHNICAL ENGINEER READS THE SAME PACK ───────────────────────────────────────
    await eng.goto(`/commissioning/${system.id}/certificate`, { waitUntil: 'domcontentloaded' });
    await expect(eng.locator('body')).toContainText(`${doc.documentNumber} rev A`, { timeout: 60_000 });

    // ── HANDOVER / FM RECEIVES IT IN THE DOSSIER ──────────────────────────────────────────────────
    const pkgCode = `HO-TC10-${stamp}`;
    const pkg = await request.post(`${API}/api/v1/commissioning/handovers`, { headers: H(), data: { projectId, code: pkgCode, title: 'Podium handover' } });
    expect(pkg.ok(), await pkg.text()).toBe(true);
    await fm.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
    const card = fm.getByTestId(`dossier-${pkgCode}`);
    await expect(async () => {
      await fm.getByTestId(`dossier-open-${pkgCode}`).click();
      await expect(card.getByTestId('dossier-section-commissioning_certificate')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await expect(card.getByTestId('dossier-section-commissioning_certificate')).toContainText(doc.documentNumber);
    await expect(card.getByTestId('dossier-section-commissioning_certificate')).toContainText(/rev A/i);
  } finally {
    await tc.context().close();
    await fm.context().close();
    await eng.context().close();
  }
});
