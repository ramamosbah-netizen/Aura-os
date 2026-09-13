// AURA OS — TC-GATE-17: a spare can name a real part.
//
// TC-GATE-16 gave a spare an optional `stockItemId` and described it as "a reference for whoever
// wants the part's real record". It was free text nobody checked — which is exactly what TC-GATE-6
// removed from the O&M pack, reintroduced one gate later in a smaller place. A reference nobody
// resolves is not a reference; it is a note that looks like one.
//
// Inventory keeps everything that makes a part a part — quantities, warehouse, cost, reorder policy
// — and hands over a projection of code, name and unit. Nothing here moves stock.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const INV = `${API}/api/v1/inventory/stock`;
const H = () => apiAuthHeaders();

test('a stock reference is checked when it is typed, and resolved when it is shown', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate17 Stock', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G17-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const system = await created.json();
  await page.request.post(HO, { headers: H(), data: { projectId, code: `HO-G17-${stamp}`, title: 'Tower A handover' } });

  // ── A reference the tenant has no part for is refused where it is typed ─────────────────────────
  const typo = await page.request.post(`${HO}/spares`, {
    headers: H(),
    data: { commissioningId: system.id, description: 'Spare camera', quantityRequired: 2, stockItemId: `CAM-NOPE-${stamp}` },
  });
  expect(typo.ok(), 'a stock reference that matches nothing must be refused').toBe(false);
  expect(JSON.stringify(await typo.json())).toMatch(/must match a part in inventory/i);

  // ── A spare with NO reference is fine: describing a part in words is still listing it ───────────
  const plain = await page.request.post(`${HO}/spares`, {
    headers: H(), data: { commissioningId: system.id, description: 'Assorted fixings', quantityRequired: 1 },
  });
  expect(plain.ok(), `a spare without a stock reference is legitimate — ${await plain.text()}`).toBe(true);

  // ── A real part, created in INVENTORY, where parts are created ──────────────────────────────────
  const partCode = `CAM-DOME-${stamp}`;
  const part = await page.request.post(INV, {
    headers: H(), data: { code: partCode, name: '4MP dome camera', unit: 'ea', warehouse: 'MAIN' },
  });
  expect(part.ok(), `inventory must accept the part — ${await part.text()}`).toBe(true);

  const linked = await page.request.post(`${HO}/spares`, {
    headers: H(),
    data: { commissioningId: system.id, description: 'Spare camera', quantityRequired: 2, stockItemId: partCode },
  });
  expect(linked.ok(), `a real part code must be accepted — ${await linked.text()}`).toBe(true);

  // ── On screen: the part as INVENTORY has it, resolved on read and stored nowhere ────────────────
  await page.goto(`/handover?project=${projectId}&section=om`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('spares-authority')).toContainText(/checked against inventory/i);
  // The spare ROWS are behind the system caret now — the authority note above it is not.
  await page.getByTestId(`spares-open-${code}`).click();
  const spareId = (await linked.json()).id;
  await expect(page.getByTestId(`spare-${spareId}`)).toContainText(partCode);
  await expect(page.getByTestId(`spare-${spareId}`)).toContainText('4MP dome camera');

  // NOT ASSERTED HERE: that a renamed part reads renamed, because Inventory exposes no rename
  // endpoint to drive it through. A conditional assertion that can never execute is test-shaped
  // nothing, so the property is asserted at the unit level instead, against the resolver directly.
});
