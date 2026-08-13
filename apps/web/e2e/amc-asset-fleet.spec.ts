// AURA OS — AMC / assets / fleet governed workflows, browser E2E (last of G-08).
//
// Drives the three registers that were CRUD until now through the real UI, asserting the thing
// that makes each one a workflow: the work order's SLA outcome, the asset's disposal gate, and the
// traffic fine's dispute exits.
import { expect, test } from '@playwright/test';

const RUN = Date.now().toString().slice(-6);
const DAY = 86_400_000;

// `next dev` compiles a route the first time it is requested. These three registers and their 360s
// are new, so the first navigation in each test paid a multi-second compile that ran past the
// 15s assertion timeout and failed the run — while a warm re-run passed every time. Compiling them
// once up front, outside any assertion, keeps the specs measuring the product rather than the
// bundler. (Cheap: subsequent navigations hit the compiled route.)
test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage();
  for (const route of ['/amc/work-orders', '/assets/register', '/fleet/fines']) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.close();
});

test('work order register → 360 → assign → complete, with the SLA outcome stamped (UI)', async ({ page, baseURL }) => {
  // Seed a live contract so the work order has an SLA to be judged against.
  const contractRes = await page.request.post(`${baseURL}/api/amc/contracts`, {
    data: {
      contractNumber: `AMC-E2E-${RUN}`,
      clientName: 'Emaar',
      serviceScope: 'ELV maintenance',
      startDate: new Date(Date.now() - 30 * DAY).toISOString(),
      endDate: new Date(Date.now() + 30 * DAY).toISOString(),
      value: 100000,
      slaResolutionHours: 24,
    },
  });
  test.skip(contractRes.status() === 502 || contractRes.status() === 404, 'AMC API not running behind the web shell');
  expect(contractRes.ok()).toBeTruthy();
  const contract = await contractRes.json();

  const order = await (
    await page.request.post(`${baseURL}/api/amc/work-orders`, {
      data: { contractId: contract.id, orderNumber: `WO-E2E-${RUN}`, description: `E2E compressor ${RUN}` },
    })
  ).json();

  // 1. The register lists it, unmeasured until the visit closes.
  await page.goto('/amc/work-orders', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('work-order-register')).toContainText(`WO-E2E-${RUN}`);
  await expect(page.getByTestId(`sla-none-${order.id}`)).toBeVisible();

  // 2. Open the 360 — no SLA outcome yet.
  await page.getByTestId(`open-wo-${order.id}`).click();
  await expect(page.getByTestId('wo-status')).toHaveText('Open');
  await expect(page.getByTestId('wo-sla-unmeasured')).toBeVisible();
  await expect(page.getByTestId('wo-contract')).toContainText(`AMC-E2E-${RUN}`);

  // 3. Assign, then complete — the SLA outcome is stamped at completion.
  await page.getByTestId('input-technician').fill('tech-e2e');
  await page.getByTestId('btn-assign').click();
  await expect(page.getByTestId('wo-status')).toHaveText('Assigned');

  await page.getByTestId('input-cost').fill('1500');
  await page.getByTestId('btn-complete').click();
  await expect(page.getByTestId('wo-status')).toHaveText('Completed');
  await expect(page.getByTestId('wo-sla-outcome')).toContainText('Met');

  // 4. Completed is terminal — the actions are gone.
  await expect(page.getByTestId('work-order-terminal')).toBeVisible();
  await expect(page.getByTestId('btn-complete')).toHaveCount(0);
});

test('asset 360 shows the disposal gate blocking while maintenance is open (UI)', async ({ page, baseURL }) => {
  const assetRes = await page.request.post(`${baseURL}/api/assets`, {
    data: {
      name: `E2E Generator ${RUN}`,
      serialNumber: `GEN-E2E-${RUN}`,
      category: 'Plant',
      purchaseDate: '2026-01-01',
      purchaseCost: 100000,
    },
  });
  test.skip(assetRes.status() === 502 || assetRes.status() === 404, 'Assets API not running behind the web shell');
  const asset = await assetRes.json();

  // Clean asset — nothing open, so it is disposable.
  await page.goto(`/assets/register/${asset.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('asset-status')).toHaveText('Active');
  await expect(page.getByTestId('asset-disposable')).toBeVisible();

  // Book work against it: the register shows it out of service and the gate closes.
  const job = await (
    await page.request.post(`${baseURL}/api/assets/maintenance`, {
      data: { assetId: asset.id, date: '2026-07-15', description: 'Rewind alternator' },
    })
  ).json();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('asset-status')).toHaveText('In Maintenance');
  await expect(page.getByTestId('asset-disposal-blocked')).toContainText('1 maintenance job');

  // Complete it — back in service, gate reopens.
  expect((await page.request.put(`${baseURL}/api/assets/maintenance/${job.id}/complete`, {
    data: { actualCost: 4200 },
  })).ok()).toBeTruthy();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('asset-status')).toHaveText('Active');
  await expect(page.getByTestId('asset-disposable')).toBeVisible();
});

test('a disputed traffic fine can be resolved both ways from the UI', async ({ page, baseURL }) => {
  const vehicleRes = await page.request.post(`${baseURL}/api/fleet/vehicles`, {
    data: { plateNumber: `E2E-${RUN}`, make: 'Toyota', model: 'Hilux', year: 2024 },
  });
  test.skip(vehicleRes.status() === 502 || vehicleRes.status() === 404, 'Fleet API not running behind the web shell');
  const vehicle = await vehicleRes.json();

  const raise = async (violation: string) =>
    (await page.request.post(`${baseURL}/api/fleet/fines`, {
      data: {
        vehicleId: vehicle.id,
        fineNumber: `DXB-${violation.slice(0, 3)}-${RUN}`,
        violation,
        amount: 600,
        blackPoints: 4,
        fineDate: '2026-07-01',
      },
    })).json();

  const lost = await raise('Speeding');
  const won = await raise('Parking');

  await page.goto('/fleet/fines', { waitUntil: 'domcontentloaded' });

  // Dispute both, then take each exit.
  await page.getByTestId(`fine-dispute-${lost.id}`).click();
  await expect(page.getByTestId(`fine-dispute-rejected-${lost.id}`)).toBeVisible();

  // Dispute lost → back to pending, so recovery can resume.
  await page.getByTestId(`fine-dispute-rejected-${lost.id}`).click();
  await expect(page.getByTestId(`fine-assign-${lost.id}`)).toBeVisible();

  // Dispute won → cancelled, terminal: no pay/assign action remains.
  await page.getByTestId(`fine-dispute-${won.id}`).click();
  await page.getByTestId(`fine-dispute-upheld-${won.id}`).click();
  await expect(page.getByTestId(`fine-pay-${won.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`fine-assign-${won.id}`)).toHaveCount(0);
});
