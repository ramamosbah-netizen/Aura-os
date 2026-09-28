import { expect, test, type APIResponse } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';
import { canBuildGovernedDelivery, createGovernedDelivery } from './governed-delivery';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * J5-02 — THE IPC IS OPENED FROM THE PROJECT AND VALUED BY MEASURED LINES AT THE AWARDED RATE.
 *
 * The finding: the IPC screen worked in gross values with none of the quantity lines the API had,
 * and entering from a project did not determine the contract. Owner's decision (2026-09-28): when a
 * certificate has measured lines, the lines set its value — Σ certified quantity × the frozen
 * awarded unit rate; the QS enters quantities only.
 *
 * On a governed project (award → contract → project → delivery map) with 40 of 100 installed:
 *
 *   entry      opened with the project, the screen is that project's contract — no contract picker
 *   measure    the QS (u-e2e-qs) raises the IPC with no typed work done and measures the item: the
 *              unit and rate are the award's, 50 is refused as more than the 40 eligible, 30 is
 *              taken and values the certificate at 30 × the awarded rate
 *   refused    a typed rate on a line is refused by the API
 *   certify    a different Commercial Manager (u-e2e-qs2) certifies; the ledger carries 30 certified
 *              and the item's eligible quantity drops to 10
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

test('J5-02 — an IPC opened from the project is valued by measured lines at the awarded rate', async ({ browser, request, baseURL }) => {
  test.skip(!canBuildGovernedDelivery() || !memberPassword(), 'requires the Auth-ON local API and the e2e password');
  test.setTimeout(420_000);
  const admin = apiAuthHeaders();
  const ok = async <T>(res: APIResponse, act: string): Promise<T> => {
    expect(res.ok(), `${act} — ${res.status()} ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const run = Date.now().toString().slice(-6);

  const delivery = await createGovernedDelivery(request, { title: `IPC measure ${run}`, quantity: 100, unit: 'no' });
  try {
    await ok(await request.post(`${API}/site/installations`, {
      headers: admin, data: { projectId: delivery.projectId, boqItemId: delivery.boqItemId, date: '2026-09-20', description: 'Cameras installed', quantity: 40, unit: 'no' },
    }), 'installing 40');
    const project = await ok<{ title: string; contractId: string; handoverSnapshot: { sourceItems: Array<{ frozenItemKey: string; customerUnitPrice: number; unit: string }> } }>(
      await request.get(`${API}/projects/projects/${delivery.projectId}`, { headers: admin }), 'reading the project');
    const frozen = project.handoverSnapshot.sourceItems[0];
    const rate = frozen.customerUnitPrice;
    expect(rate, 'the award froze a unit rate').toBeGreaterThan(0);

    // ── The QS opens IPCs from the project ─────────────────────────────────────────────────────
    const qsContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const qs = await qsContext.newPage();
    expect(await signInAs(qs, baseURL!, 'u-e2e-qs'), 'u-e2e-qs signs in').toBe(true);
    await qs.goto(`/contracts/certificates?projectId=${delivery.projectId}`);
    await expect(qs.getByTestId('ipc-contract-locked')).toContainText(project.title);
    await expect(qs.getByRole('combobox')).toHaveCount(0);
    await expect(qs.getByTestId('ipc-valuation-note')).toBeVisible();
    await expect(qs.getByText('Work done to date', { exact: true })).toHaveCount(0);

    // Raise it — no typed work done — and measure the item.
    await qs.getByRole('button', { name: 'Raise IPC' }).click();
    const row = qs.getByTestId(`ipc-item-${frozen.frozenItemKey}`);
    await expect(row.getByTestId('ipc-item-eligible')).toHaveText('40');
    await expect(row).toContainText(frozen.unit);
    const qty = row.getByRole('spinbutton');
    await qty.fill('50');
    await row.getByRole('button', { name: 'Add' }).click();
    await expect(qs.getByRole('alert').filter({ hasText: 'exceeds what is eligible' })).toBeVisible();
    await qty.fill('30');
    await row.getByRole('button', { name: 'Add' }).click();
    const lines = qs.getByTestId('ipc-lines');
    await expect(lines).toContainText('30 no');
    const work = 30 * rate;
    const cert = (await ok<Array<{ id: string; contractId: string; status: string; valuation: string; cumulativeWorkDone: number; netThisCertificate: number }>>(
      await request.get(`${API}/contracts/certificates?contractId=${project.contractId}`, { headers: admin }), 'reading the certificate'))
      .find((c) => c.status === 'draft')!;
    expect(cert).toMatchObject({ valuation: 'measured', cumulativeWorkDone: work });

    // A typed rate is refused, not stripped.
    const typed = await request.post(`${API}/contracts/certificates/${cert.id}/lines`, { headers: admin, data: { frozenItemKey: frozen.frozenItemKey, quantity: 1, rate: 1 } });
    expect(typed.status()).toBe(400);
    expect(await typed.text()).toContain('cannot be typed on a measured line');

    await qs.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(async () => (await ok<{ status: string }>(await request.get(`${API}/contracts/certificates/${cert.id}`, { headers: admin }), 'status')).status).toBe('submitted');
    await qsContext.close();

    // ── A different Commercial Manager certifies ─────────────────────────────────────────────
    const certifierContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const certifier = await certifierContext.newPage();
    expect(await signInAs(certifier, baseURL!, 'u-e2e-qs2'), 'u-e2e-qs2 signs in').toBe(true);
    await certifier.goto(`/contracts/certificates?projectId=${delivery.projectId}`);
    await certifier.getByRole('button', { name: 'Certify' }).click();
    await expect.poll(async () => (await ok<{ status: string }>(await request.get(`${API}/contracts/certificates/${cert.id}`, { headers: admin }), 'status')).status).toBe('certified');

    const position = await expect.poll(async () => (await ok<{ certified: number | null }>(
      await request.get(`${API}/projects/quantity-ledger/position/${delivery.boqItemId}`, { headers: admin }), 'position')).certified, { timeout: 30_000 });
    await position.toBe(30);
    const claimable = await ok<{ valuation: string; basis: { items: Array<{ frozenItemKey: string; eligible: number; certified: number }> } }>(
      await request.get(`${API}/contracts/certificates/claimable/${project.contractId}`, { headers: admin }), 'claimable');
    expect(claimable.valuation).toBe('measured');
    expect(claimable.basis.items.find((i) => i.frozenItemKey === frozen.frozenItemKey)).toMatchObject({ certified: 30, eligible: 10 });
    await certifierContext.close();
  } finally {
    await delivery.cleanup();
  }
});
