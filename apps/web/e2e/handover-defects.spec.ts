// AURA OS — TC-GATE-9: handover stops being blind to Quality's snags.
//
// Two domains hold defects. Quality owns snags (project-scoped, low/medium/high,
// open/resolved/closed); Testing & Commissioning owns punch items (system-scoped, minor/major/
// critical, with provenance back to the failing test run). Handover readiness read the SECOND —
// through the commissioning item, whose chain gates on it — and never the first.
//
// Projects' closeout has always counted snags. So a client could be handed a package with snags
// outstanding and the closeout gate would then refuse the same project: two gates, one project,
// opposite answers. This proves they now agree, and that neither authority was merged into the other.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const QA = `${API}/api/v1/quality`;
const H = () => apiAuthHeaders();

test('an open Quality snag blocks the handover, and the surface names who owns it', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate9 Snags', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-G9-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');

  const pkgCode = `HO-G9-${stamp}`;
  await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } });

  // ── No snag yet: the item is READY on its own terms ─────────────────────────────────────────────
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-snags-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-snags')).toContainText(/Quality/i);
  await expect(page.getByTestId('handover-item-snags')).toContainText(/holds no snag/i);

  // ── Quality raises a snag. Nothing in Handover was touched ──────────────────────────────────────
  const snag = await page.request.post(`${QA}/snags`, {
    headers: H(),
    data: { projectId, description: `Ceiling tile cracked at the head end ${stamp}`, locationDetail: 'L3 riser', severity: 'high' },
  });
  expect(snag.ok(), `Quality must accept the snag — ${await snag.text()}`).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-snags-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-snags')).toContainText(/1 open snag/i);
  // The severity is Quality's word, carried through rather than restated.
  await expect(page.getByTestId('handover-item-snags')).toContainText(/most severe high/i);

  // ── The submission is refused, and the refusal names the snag item ──────────────────────────────
  const pkgs = await (await page.request.get(`${HO}?projectId=${projectId}`, { headers: H() })).json();
  const refused = await page.request.put(`${HO}/${pkgs[0].id}/submit`, { headers: H(), data: {} });
  expect(refused.ok()).toBe(false);
  expect(JSON.stringify(await refused.json())).toMatch(/Quality snags cleared/i);

  // ── The Snag & punch list shows both authorities, under their own names ─────────────────────────
  await page.getByTestId('ho-section-snags').click();
  await expect(page.getByTestId('defects-authority')).toContainText(/Handover holds neither/i);
  await expect(page.getByTestId('defects-snags')).toContainText(`Ceiling tile cracked at the head end ${stamp}`);
  await expect(page.getByTestId('defects-snags-count')).toContainText('1 open of 1');
  await expect(page.getByTestId('defects-punch')).toContainText(/No punch item has been raised/i);

  // One cause, one failure: the surface says where each is gated, and they are gated separately.
  await expect(page.getByTestId('defects-gating-note')).toContainText(/Quality snags cleared/i);
  await expect(page.getByTestId('defects-gating-note')).toContainText(/Systems commissioned and technically ready/i);

  // ── There is NO control here to close it. Handover does not write defects ───────────────────────
  const section = page.getByTestId('defects-snags');
  await expect(section.getByRole('button')).toHaveCount(0);
});

test('a resolved snag stops blocking, because resolved is Quality’s word for not open', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate9 Resolve', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-G9R-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  await page.request.post(HO, { headers: H(), data: { projectId, code: `HO-G9R-${stamp}`, title: 'Tower A handover' } });

  const snag = await (await page.request.post(`${QA}/snags`, {
    headers: H(),
    data: { projectId, description: `Low-severity mark ${stamp}`, locationDetail: 'L1 lobby', severity: 'low' },
  })).json();

  // Even a LOW severity snag blocks: deciding that low does not count would be Handover restating a
  // threshold that belongs to Quality.
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-snags-state')).toHaveText('BLOCKED');

  // Quality resolves it — in Quality, which is the only place that can.
  const resolved = await page.request.put(`${QA}/snags/${snag.id}/resolve`, { headers: H() });
  expect(resolved.ok(), `Quality must resolve its own snag — ${await resolved.text()}`).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-snags-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-snags')).toContainText(/resolved or closed/i);
});
