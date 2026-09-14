import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.WEB_PORT ?? 3100}`;
const PASSWORD = 'Aura-Wave2-Roles-2026!';

async function createRoleUser(
  admin: Page,
  suffix: string,
  displayName: string,
  roleId: string,
): Promise<string> {
  const userId = `wave2-${suffix}-${Date.now()}`;
  const created = await admin.request.post('/api/admin/users', {
    data: { userId, displayName, email: `${userId}@example.invalid` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const credential = await admin.request.post(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
    data: { password: PASSWORD, mustChange: false },
  });
  expect(credential.ok(), await credential.text()).toBe(true);
  const grant = await admin.request.post('/api/admin/access/grants', { data: { userId, roleId } });
  expect(grant.ok(), await grant.text()).toBe(true);
  return userId;
}

async function signIn(browser: Browser, userId: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-username').fill(userId);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  return { context, page };
}

async function makeApprovalReady(admin: Page, quotationId: string): Promise<void> {
  const seeded = await admin.request.post('/api/document-requirements/seed', {
    data: { entityType: 'crm.quotation', entityId: quotationId },
  });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const rowsResponse = await admin.request.get(`/api/document-requirements?entityType=crm.quotation&entityId=${quotationId}`);
  expect(rowsResponse.ok(), await rowsResponse.text()).toBe(true);
  const rows = await rowsResponse.json() as { requirements: Array<{ id: string }> };
  for (const requirement of rows.requirements) {
    const waived = await admin.request.post(`/api/document-requirements/${requirement.id}/waive`, {
      data: { reason: 'Wave 2 role-bound browser proof fixture' },
    });
    expect(waived.ok(), await waived.text()).toBe(true);
  }
}

test('Estimator prepares, Commercial approves, and Sales submits without seeing internal cost', async ({ page: admin, browser }) => {
  const users: string[] = [];
  const contexts: BrowserContext[] = [];
  try {
    const estimatorId = await createRoleUser(admin, 'estimator', 'Wave 2 Estimator', 'r-estimator');
    const commercialId = await createRoleUser(admin, 'commercial', 'Wave 2 Commercial Manager', 'r-commercial-manager');
    const salesId = await createRoleUser(admin, 'sales', 'Wave 2 Sales', 'r-sales');
    users.push(estimatorId, commercialId, salesId);

    const estimator = await signIn(browser, estimatorId);
    contexts.push(estimator.context);
    const created = await estimator.page.request.post('/api/crm/quotations', {
      data: {
        customerName: 'Wave 2 role workflow customer',
        subject: 'CCTV supply, installation, testing and commissioning',
        issueDate: '2026-09-14',
        validUntil: '2026-10-14',
        paymentConditions: '30% advance and balance against milestones',
        deliveryTerms: 'Six weeks after approved submittal',
        lines: [{ description: 'IP camera complete', quantity: 24, unit: 'no', unitPrice: 1, vatRate: 5 }],
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const quotation = await created.json() as { id: string; quoteNumber: string };

    await estimator.page.goto(`/crm/quotations/${quotation.id}/pricing`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.page.getByRole('heading', { name: /Pricing workspace/ })).toBeVisible();
    await estimator.page.getByLabel('item').fill('IP camera complete');
    await estimator.page.getByLabel('Quantity').fill('24');
    await estimator.page.getByLabel('Unit cost').fill('100');
    await estimator.page.getByLabel('Hours / unit').fill('2');
    await estimator.page.getByLabel('Crew size').fill('2');
    await estimator.page.getByLabel('Rate / hour').fill('35');
    await estimator.page.getByLabel('Target margin %').fill('20');
    await estimator.page.getByRole('button', { name: 'Save draft (creates the sheet)' }).click();
    await expect(estimator.page.getByText(/Draft saved — sheet v1/)).toBeVisible();
    await estimator.page.getByRole('button', { name: /Freeze baseline/ }).click();
    await expect(estimator.page.getByText(/Baseline frozen/)).toBeVisible();
    await estimator.page.getByRole('button', { name: /Generate quotation/ }).click();
    await expect(estimator.page.getByText('Quotation lines generated from the frozen sheet.')).toBeVisible();

    await estimator.page.goto(`/crm/quotations/${quotation.id}`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.page.getByRole('link', { name: 'Pricing sheet' })).toBeVisible();
    await expect(estimator.page.getByText('Margin', { exact: true }).first()).toBeVisible();
    await expect(estimator.page.getByRole('button', { name: /Approve/ })).toHaveCount(0);
    await expect(estimator.page.getByRole('button', { name: /Submit for review/ }).first()).toBeVisible();
    const estimatorApprove = await estimator.page.request.patch(`/api/crm/quotations/${quotation.id}/status`, {
      data: { action: 'approve' },
    });
    expect(estimatorApprove.status()).toBe(403);
    await estimator.page.getByRole('button', { name: /Submit for review/ }).first().click();
    await expect(estimator.page.getByText(/Internal review/i).first()).toBeVisible();

    await makeApprovalReady(admin, quotation.id);

    const commercial = await signIn(browser, commercialId);
    contexts.push(commercial.context);
    await commercial.page.goto(`/crm/quotations/${quotation.id}`, { waitUntil: 'domcontentloaded' });
    await expect(commercial.page.getByRole('link', { name: 'Pricing sheet' })).toBeVisible();
    await expect(commercial.page.getByRole('button', { name: /Approve/ }).first()).toBeVisible();
    await commercial.page.getByRole('button', { name: /Approve/ }).first().click();
    await expect(commercial.page.getByText('Approved', { exact: true }).first()).toBeVisible();

    const sales = await signIn(browser, salesId);
    contexts.push(sales.context);
    await sales.page.goto(`/crm/quotations/${quotation.id}`, { waitUntil: 'domcontentloaded' });
    await expect(sales.page.getByRole('link', { name: 'Pricing sheet' })).toHaveCount(0);
    await expect(sales.page.getByText('Pricing & margin', { exact: true })).toHaveCount(0);
    await expect(sales.page.getByRole('button', { name: /Approve/ })).toHaveCount(0);
    const salesPricing = await sales.page.request.get(`/api/crm/quotations/${quotation.id}/pricing`);
    expect(salesPricing.status()).toBe(403);
    await expect(sales.page.getByRole('button', { name: 'Record as sent' }).first()).toBeVisible();
    await sales.page.getByRole('button', { name: 'Record as sent' }).first().click();
    await expect(sales.page.getByText('Sent', { exact: true }).first()).toBeVisible();
    await expect(sales.page.getByRole('button', { name: 'Start negotiation' })).toBeVisible();
    await sales.page.getByRole('button', { name: 'Start negotiation' }).click();
    await expect(sales.page.getByText('Under negotiation', { exact: true }).first()).toBeVisible();
  } finally {
    for (const context of contexts.reverse()) await context.close();
    for (const userId of users.reverse()) {
      await admin.request.delete(`/api/admin/users/${encodeURIComponent(userId)}`);
    }
  }
});
