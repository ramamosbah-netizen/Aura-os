// AURA OS — TC-GATE-16: spares, the last readiness item to get an authority.
//
// Every closure register from TC-GATE-4 onwards recorded this item as "nothing verifies this".
// Nothing in the repository held the fact: Inventory records a part being ISSUED TO A PROJECT, which
// is how it gets installed, not handed to the building owner; and the O&M pack's recommended-spares
// list is a document, and a list is not a delivery.
//
// With this, no handover readiness item is asserted any more — the six booleans the whole sequence
// began with have nothing left in them.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const H = () => apiAuthHeaders();

test('the client’s acknowledgement is what satisfies the gate, not ours', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate16 Spares', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const code = `TC-G16-${stamp}`;
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(created.status() === 502 || created.status() === 404 || !created.ok(), 'commissioning API not reachable');
  const system = await created.json();

  const pkgCode = `HO-G16-${stamp}`;
  await page.request.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } });

  // ── Nothing listed: UNKNOWN, because nothing was asked for ──────────────────────────────────────
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-spares-state')).toHaveText('UNKNOWN');
  await expect(page.getByTestId('handover-item-spares')).toContainText(/no spares listed/i);
  // And it is DERIVED — the tick is gone.
  await expect(page.getByTestId('handover-item-spares')).toContainText(/derived · Handover/i);

  // ── Listed, and the gate blocks ─────────────────────────────────────────────────────────────────
  await page.goto(`/handover?project=${projectId}&section=om`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('spares-authority')).toContainText(/a list is not a delivery/i);
  await page.getByTestId(`spare-description-${code}`).fill('Spare camera');
  await page.getByTestId(`spare-quantity-${code}`).fill('2');
  await page.getByTestId(`spare-add-${code}`).click();
  await expect(page.getByTestId(`spares-state-${code}`)).toHaveText('0/1 acknowledged', { timeout: 15_000 });

  const spares = (await (await page.request.get(`${HO}/spares?projectId=${projectId}`, { headers: H() })).json()) as { id: string }[];
  expect(spares).toHaveLength(1);
  const spareId = spares[0].id;

  // ── Handing over is OUR word, and it is not enough ───────────────────────────────────────────────
  await page.getByTestId(`spare-hand-over-${spareId}`).click();
  await expect(page.getByTestId(`spare-handed-${spareId}`)).toHaveText('2', { timeout: 15_000 });

  await page.getByTestId('ho-section-packages').click();
  await expect(page.getByTestId('handover-item-spares-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-spares')).toContainText(/not acknowledged by the client/i);
  await expect(page.getByTestId('handover-item-spares')).toContainText(/1 handed over but not confirmed/i);

  // ── The client's word is what clears it ─────────────────────────────────────────────────────────
  await page.goto(`/handover?project=${projectId}&section=om`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`spare-ack-name-${spareId}`).fill('Client Rep');
  await page.getByTestId(`spare-acknowledge-${spareId}`).click();
  await expect(page.getByTestId(`spare-ack-${spareId}`)).toHaveText('Client Rep', { timeout: 15_000 });

  await page.getByTestId('ho-section-packages').click();
  await expect(page.getByTestId('handover-item-spares-state')).toHaveText('READY');
  await expect(page.getByTestId('handover-item-spares')).toContainText(/acknowledged by the client/i);

  void system;
});

test('the guards that keep the record honest', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate16 Guards', baseURL);
  const stamp = Date.now().toString().slice(-5);
  const created = await page.request.post(CX, { headers: H(), data: { projectId, code: `TC-G16G-${stamp}`, title: 'CCTV — Tower A', system: 'cctv' } });
  test.skip(!created.ok(), 'commissioning API not reachable');
  const system = await created.json();
  // The readiness panel only renders for a package, so this test needs one to read the gate from.
  await page.request.post(HO, { headers: H(), data: { projectId, code: `HO-G16G-${stamp}`, title: 'Guards' } });

  const spare = await (await page.request.post(`${HO}/spares`, {
    headers: H(), data: { commissioningId: system.id, description: 'Spare card', quantityRequired: 5 },
  })).json();

  // Acknowledging before anything was handed over: an acknowledgement of nothing is not evidence.
  const early = await page.request.put(`${HO}/spares/${spare.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });
  expect(early.ok()).toBe(false);
  expect(JSON.stringify(await early.json())).toMatch(/only a spare that has been handed over can be acknowledged/i);

  // More than asked for is a typo or an unrecorded change, and both are worth refusing.
  const tooMany = await page.request.put(`${HO}/spares/${spare.id}/hand-over`, { headers: H(), data: { quantity: 8 } });
  expect(tooMany.ok()).toBe(false);
  expect(JSON.stringify(await tooMany.json())).toMatch(/must not exceed the 5 required/i);

  // A PART delivery is a real thing and is allowed — but it does not satisfy the gate.
  const partial = await page.request.put(`${HO}/spares/${spare.id}/hand-over`, { headers: H(), data: { quantity: 3 } });
  expect(partial.ok(), `a partial hand-over is legitimate — ${await partial.text()}`).toBe(true);
  await page.request.put(`${HO}/spares/${spare.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });

  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('handover-item-spares-state')).toHaveText('BLOCKED');
  await expect(page.getByTestId('handover-item-spares')).toContainText(/short of the quantity asked for/i);

  // An acknowledgement needs a NAMED representative — "acknowledged" with nobody attached is our
  // word again, and the whole point of the field is that it is not ours.
  const second = await (await page.request.post(`${HO}/spares`, {
    headers: H(), data: { commissioningId: system.id, description: 'Spare PSU', quantityRequired: 1 },
  })).json();
  await page.request.put(`${HO}/spares/${second.id}/hand-over`, { headers: H(), data: { quantity: 1 } });
  const nameless = await page.request.put(`${HO}/spares/${second.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: '  ' } });
  expect(nameless.ok()).toBe(false);
});
