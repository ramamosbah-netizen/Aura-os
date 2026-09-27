import { expect, test, type APIResponse } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * J3-04 — A PURCHASE ORDER'S SUPPLIER IS VALIDATED ON EVERY CHANGE AND FIXED ONCE THE ORDER LEAVES DRAFT.
 *
 * The finding: editing an order's supplier to `missing-supplier` was saved (validation ran on create
 * and not on edit). The existence, tenant and approval checks on edit have since been added; what
 * the finding also asked for — what may change after issue — had no rule, and an issued order could
 * still be re-pointed at a different APPROVED supplier with a 200. Against the running API and
 * PostgreSQL, by the Buyer who edits orders:
 *
 *   draft      the Buyer may still choose between approved suppliers; a missing one is 404 (a
 *              malformed id too) and an unapproved one is refused (409)
 *   issued     re-pointing it at another approved supplier, or unbinding it, is refused (409) in
 *              words that say what to do instead; the title can still be corrected
 *   on screen  the order page still names the supplier it was issued to
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test('J3-04 — an order’s supplier is validated on every change and fixed once it leaves draft', async ({ page, request }) => {
  const admin = apiAuthHeaders();
  test.skip(!admin.Authorization, 'requires the Auth-ON local API');
  const login = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-buyer', password: process.env.E2E_PASSWORD ?? 'e2e-password' } });
  expect(login.ok(), `u-e2e-buyer must sign in — ${await login.text()}`).toBe(true);
  const buyer = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` };
  const ok = async <T>(res: APIResponse, act: string): Promise<T> => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const run = Date.now().toString().slice(-6);

  // Two suppliers the Buyer registers and the Procurement Manager admits; a third left pending.
  const supplier = async (name: string, code: string, admit: boolean) => {
    const s = await ok<{ id: string; name: string }>(await request.post(`${API}/procurement/suppliers`, { headers: buyer, data: { code: `${code}-${run}`, name: `${name} ${run}`, category: 'materials' } }), `registering ${name}`);
    if (admit) await ok(await request.patch(`${API}/procurement/suppliers/${s.id}/status`, { headers: admin, data: { action: 'approve' } }), `admitting ${name}`);
    return s;
  };
  const hik = await supplier('Hikvision MEA', 'J304-HIK', true);
  const dahua = await supplier('Dahua Gulf', 'J304-DAH', true);
  const pending = await supplier('Unvetted Trading', 'J304-UNV', false);

  const order = await ok<{ id: string; status: string }>(await request.post(`${API}/procurement/purchase-orders`, {
    headers: buyer, data: { title: `Cameras J3-04 ${run}`, reference: `PO-J304-${run}`, value: 900, supplierId: hik.id },
  }), 'raising the order');
  const edit = (data: Record<string, unknown>) => request.patch(`${API}/procurement/purchase-orders/${order.id}`, { headers: buyer, data });

  // ── Draft: every change is validated, and the Buyer may still choose ────────────────────────
  expect((await edit({ supplierId: 'missing-supplier', supplierName: 'Unverified vendor' })).status(), 'a supplier that does not exist').toBe(404);
  const unapproved = await edit({ supplierId: pending.id });
  expect(unapproved.status(), 'a supplier not admitted to the master: its state forbids it').toBe(409);
  expect(await unapproved.text()).toContain('is not approved');
  expect(await ok<{ supplierId: string; supplierName: string }>(await edit({ supplierId: dahua.id, supplierName: 'Typed over' }), 'choosing Dahua'))
    .toMatchObject({ supplierId: dahua.id, supplierName: dahua.name });
  expect(await ok<{ supplierId: string }>(await edit({ supplierId: hik.id }), 'back to Hikvision')).toMatchObject({ supplierId: hik.id });

  // ── Submitted and issued: the supplier it was issued to is the supplier it has ──────────────
  await ok(await request.post(`${API}/procurement/purchase-orders/${order.id}/submit`, { headers: buyer, data: {} }), 'submitting');
  await ok(await request.post(`${API}/procurement/purchase-orders/${order.id}/issue`, { headers: admin, data: {} }), 'issuing');
  const swapped = await edit({ supplierId: dahua.id });
  expect(swapped.status(), 'another approved supplier, after issue').toBe(409);
  expect(await swapped.text()).toContain('can only be changed while it is a draft');
  expect(await swapped.text()).toContain('cancel it and raise a new order');
  expect((await edit({ supplierId: null })).status(), 'unbinding the supplier, after issue').toBe(409);
  expect((await edit({ supplierId: 'missing-supplier' })).status(), 'a missing supplier is still reported as missing').toBe(404);
  expect(await ok<{ title: string; supplierId: string }>(await edit({ title: `Cameras J3-04 ${run} (corrected)` }), 'correcting the title'))
    .toMatchObject({ title: `Cameras J3-04 ${run} (corrected)`, supplierId: hik.id });

  const stored = await ok<{ status: string; supplierId: string; supplierName: string }>(await request.get(`${API}/procurement/purchase-orders/${order.id}`, { headers: buyer }), 'reading it back');
  expect(stored).toMatchObject({ status: 'issued', supplierId: hik.id, supplierName: hik.name });

  // ── On screen: the order names the supplier it was issued to ───────────────────────────────
  await page.goto(`/procurement/purchase-orders/${order.id}`);
  await expect(page.getByText(`Cameras J3-04 ${run} (corrected)`).first()).toBeVisible();
  await expect(page.getByText(hik.name).first()).toBeVisible();
  await expect(page.getByText(dahua.name)).toHaveCount(0);
});
