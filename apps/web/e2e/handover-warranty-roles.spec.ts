// AURA OS — HO-05: the warranty certificate, by the roles that own it. Auth ON, PostgreSQL.
//
// handover-om-training.spec.ts proves the O&M pack mechanism — the warranty certificate is its own
// deliverable, submitted only against a document the register holds, and its own readiness item —
// driven as an administrator. Here, the people whose job it is:
//
//   register   the Document Controller registers the warranty certificate
//   submit     the T&C Engineer lays out the system's pack and submits the warranty certificate on
//              screen against that document
//   refused    QA/QC, who reads commissioning, may not move a deliverable (403)
//   accept     Handover / FM reviews and accepts it on screen; it survives a reload, and the record
//              names who accepted it
//   receipt    the Project Manager sees the warranty-certificates readiness item READY on the handover
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const HO = `${API}/api/v1/commissioning/handovers`;
const H = () => apiAuthHeaders();
const W = 'warranty_certificate';

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('the warranty certificate is submitted by T&C, accepted by Handover / FM, and refused to QA/QC', async ({ browser, baseURL, page, request }) => {
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

  const projectId = await createProject(page.request, 'HO-05 Warranty', baseURL);
  const stamp = Date.now().toString().slice(-6);
  const code = `HO05-${stamp}`;
  const created = await request.post(`${API}/api/v1/commissioning/records`, { headers: H(), data: { projectId, code, title: 'Access control — Tower C', system: 'access_control' } });
  expect(created.ok(), await created.text()).toBe(true);
  const system = (await created.json()) as { id: string };
  const pkg = await request.post(HO, { headers: H(), data: { projectId, code: `PKG-${code}`, title: 'Tower C handover' } });
  expect(pkg.ok(), await pkg.text()).toBe(true);

  // ── DOCUMENT CONTROL REGISTERS THE CERTIFICATE ──────────────────────────────────────────────────
  const registered = await request.post(`${API}/api/v1/doccontrol/register`, {
    headers: await tokenOf('u-e2e-doccon'),
    data: { projectId, documentNumber: `WAR-${stamp}`, title: 'Access control manufacturer warranty — Tower C', discipline: 'elv', docType: 'document', currentRevision: 'A', status: 'for_construction' },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const doc = (await registered.json()) as { documentNumber: string };

  const tc = await seat(browser, baseURL!, 'u-e2e-tc');
  const fm = await seat(browser, baseURL!, 'u-e2e-fm');
  const pm = await seat(browser, baseURL!, 'u-e2e-pm');
  try {
    const openPack = async (p: Page) => {
      await p.goto(`/handover?project=${projectId}&section=om`, { waitUntil: 'domcontentloaded' });
      await expect(async () => {
        if (!(await p.getByTestId(`om-item-state-${code}-${W}`).isVisible()) && !(await p.getByTestId(`om-seed-${code}`).isVisible())) {
          await p.getByTestId(`om-open-${code}`).click({ timeout: 3_000 });
        }
        await expect(p.getByTestId(`om-item-state-${code}-${W}`).or(p.getByTestId(`om-seed-${code}`))).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
    };

    // ── T&C LAYS OUT THE PACK AND SUBMITS THE CERTIFICATE, ON SCREEN ──────────────────────────────
    await openPack(tc);
    await tc.getByTestId(`om-seed-${code}`).click();
    await expect(tc.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('required', { timeout: 30_000 });
    await tc.getByTestId(`om-doc-${code}-${W}`).fill(doc.documentNumber);
    await tc.getByTestId(`om-advance-${code}-${W}`).click();
    await expect(tc.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('submitted', { timeout: 30_000 });
    await expect(tc.getByTestId(`om-doc-state-${code}-${W}`)).toContainText(doc.documentNumber);

    // ── QA/QC MAY NOT MOVE IT ─────────────────────────────────────────────────────────────────────
    const items = (await (await request.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as Array<{ id: string; deliverable: string }>;
    const warranty = items.find((i) => i.deliverable === W)!;
    expect((await request.put(`${HO}/om-items/${warranty.id}/state`, { headers: await tokenOf('u-e2e-qaqc'), data: { to: 'reviewed' } })).status()).toBe(403);

    // ── HANDOVER / FM REVIEWS AND ACCEPTS IT, ON SCREEN ───────────────────────────────────────────
    await openPack(fm);
    await expect(fm.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('submitted');
    await fm.getByTestId(`om-advance-${code}-${W}`).click();
    await expect(fm.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('reviewed', { timeout: 30_000 });
    await fm.getByTestId(`om-advance-${code}-${W}`).click();
    await expect(fm.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('accepted', { timeout: 30_000 });
    await openPack(fm);
    await expect(fm.getByTestId(`om-item-state-${code}-${W}`)).toHaveText('accepted');
    const accepted = ((await (await request.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as Array<{ deliverable: string; acceptedBy: string | null; submittedBy?: string | null }>).find((i) => i.deliverable === W)!;
    expect(accepted.acceptedBy, 'the record names who accepted it').toBe('u-e2e-fm');

    // ── IT IS IN THE DOSSIER THE CLIENT IS HANDED ─────────────────────────────────────────────────
    await fm.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
    const card = fm.getByTestId(`dossier-PKG-${code}`);
    await expect(async () => {
      await fm.getByTestId(`dossier-open-PKG-${code}`).click({ timeout: 3_000 });
      await expect(card.getByTestId('dossier-section-om_deliverable')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await expect(card.getByTestId('dossier-section-om_deliverable')).toContainText(doc.documentNumber);

    // ── THE PROJECT MANAGER SEES THE WARRANTY ITEM READY ──────────────────────────────────────────
    await pm.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(pm.getByTestId('handover-item-warrantyDocs-state')).toHaveText('READY', { timeout: 60_000 });
    // …and the rest of the O&M pack, still not accepted, does not ride on it.
    await expect(pm.getByTestId('handover-item-omManuals-state')).not.toHaveText('READY');
  } finally {
    await tc.context().close();
    await fm.context().close();
    await pm.context().close();
  }
});
