import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  page.setDefaultTimeout(20_000);
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
  test.setTimeout(300_000);
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
    const rev0BaselineResponse = await commercial.page.request.get(`/api/crm/quotations/${quotation.id}/baseline`);
    expect(rev0BaselineResponse.ok(), await rev0BaselineResponse.text()).toBe(true);
    const rev0Baseline = await rev0BaselineResponse.json() as { id: string; quotationId: string; revision: number; total: number; lines: Array<{ quantity: number }> };
    expect(rev0Baseline).toMatchObject({ quotationId: quotation.id, revision: 0 });
    expect(rev0Baseline.lines[0].quantity).toBe(24);

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

    const negotiationReason = 'Customer requested a revised payment schedule and an 8% commercial review.';
    const negotiationEntry = await sales.page.request.post('/api/crm/negotiation', {
      data: { quotationId: quotation.id, type: 'DISCOUNT_REQUESTED', percent: 8, note: negotiationReason },
    });
    expect(negotiationEntry.ok(), await negotiationEntry.text()).toBe(true);

    const originalPath = `/crm/quotations/${quotation.id}`;
    await Promise.all([
      sales.page.waitForURL((url) => url.pathname.startsWith('/crm/quotations/') && url.pathname !== originalPath),
      sales.page.getByRole('button', { name: 'Revise ↺' }).click(),
    ]);
    await expect(sales.page.getByText('Draft', { exact: true }).first()).toBeVisible();
    const revisedId = new URL(sales.page.url()).pathname.split('/').pop()!;
    const revisionResponse = await sales.page.request.get(`/api/crm/quotations/${revisedId}/revisions`);
    expect(revisionResponse.ok(), await revisionResponse.text()).toBe(true);
    const revisionChain = await revisionResponse.json() as Array<{ id: string; revision: number; status: string }>;
    expect(revisionChain.map(({ id, revision, status }) => ({ id, revision, status }))).toEqual([
      { id: quotation.id, revision: 0, status: 'revised' },
      { id: revisedId, revision: 1, status: 'draft' },
    ]);

    // Rev 0 remains readable evidence, but every mutation and stale repeat is rejected.
    const oldPage = await sales.context.newPage();
    await oldPage.goto(`/crm/quotations/${quotation.id}?focus=revisions`, { waitUntil: 'domcontentloaded' });
    await expect(oldPage.getByText('Revised', { exact: true }).first()).toBeVisible();
    await expect(oldPage.getByText('Locked past draft — revise the quote to change these.')).toBeVisible();
    await expect(oldPage.getByRole('button', { name: 'Record as sent' })).toHaveCount(0);
    const oldPdf = await sales.page.request.get(`/api/crm/quotations/${quotation.id}/pdf`);
    expect(oldPdf.ok(), await oldPdf.text()).toBe(true);
    expect(oldPdf.headers()['content-disposition']).toContain('rev-0.pdf');
    const oldTerms = await sales.page.request.patch(`/api/crm/quotations/${quotation.id}/terms`, {
      data: { paymentConditions: 'spoofed overwrite' },
    });
    expect(oldTerms.status()).toBe(409);
    const oldSend = await sales.page.request.patch(`/api/crm/quotations/${quotation.id}/status`, { data: { action: 'send' } });
    expect(oldSend.status()).toBe(400);
    const staleRevision = await sales.page.request.post(`/api/crm/quotations/${quotation.id}/revise`, {
      data: { parentQuotationId: 'forged-parent', revision: 99 },
    });
    expect(staleRevision.status()).toBe(400);
    await oldPage.close();

    // The new pricing workspace starts with the carried cost/quantity build-up, so negotiation does
    // not require re-entering commercial truth. Change one policy input, then freeze and regenerate.
    await estimator.page.goto(`/crm/quotations/${revisedId}/pricing`, { waitUntil: 'domcontentloaded' });
    await expect(estimator.page.getByLabel('Quantity')).toHaveValue('24');
    await expect(estimator.page.getByLabel('Unit cost')).toHaveValue('100');
    await estimator.page.getByLabel('Target margin %').fill('18');
    await estimator.page.getByRole('button', { name: 'Save draft (creates the sheet)' }).click();
    await expect(estimator.page.getByText(/Draft saved — sheet v1/)).toBeVisible();
    await estimator.page.getByRole('button', { name: /Freeze baseline/ }).click();
    await expect(estimator.page.getByText(/Baseline frozen/)).toBeVisible();
    await estimator.page.getByRole('button', { name: /Generate quotation/ }).click();
    await expect(estimator.page.getByText('Quotation lines generated from the frozen sheet.')).toBeVisible();

    await sales.page.goto(`/crm/quotations/${revisedId}?focus=terms`, { waitUntil: 'domcontentloaded' });
    await sales.page.getByRole('tab', { name: 'Terms' }).click();
    await sales.page.getByRole('button', { name: 'Edit terms' }).click();
    await sales.page.getByLabel('Payment conditions').fill('20% advance and balance against negotiated milestones');
    await sales.page.getByRole('button', { name: 'Save terms' }).click();
    await expect(sales.page.getByText('20% advance and balance against negotiated milestones')).toBeVisible();

    // The change reason recorded on Rev 0 remains visible from Rev 1 because negotiation belongs to
    // the chain, while the price movement comes from the revision totals.
    await sales.page.goto(`/crm/quotations/${revisedId}?focus=negotiation`, { waitUntil: 'domcontentloaded' });
    await sales.page.getByRole('tab', { name: 'Negotiation' }).click();
    await expect(sales.page.getByText(negotiationReason)).toBeVisible();
    await expect(sales.page.getByText('Revision 1')).toBeVisible();

    await makeApprovalReady(admin, revisedId);
    await sales.page.goto(`/crm/quotations/${revisedId}`, { waitUntil: 'domcontentloaded' });
    await sales.page.getByRole('button', { name: /Submit for review/ }).first().click();
    await expect(sales.page.getByText(/Internal review/i).first()).toBeVisible();
    const selfApprove = await sales.page.request.patch(`/api/crm/quotations/${revisedId}/status`, { data: { action: 'approve' } });
    expect(selfApprove.status()).toBe(403);

    await commercial.page.goto(`/crm/quotations/${revisedId}`, { waitUntil: 'domcontentloaded' });
    await commercial.page.getByRole('button', { name: /Approve/ }).first().click();
    await expect(commercial.page.getByText('Approved', { exact: true }).first()).toBeVisible();
    const rev1Response = await commercial.page.request.get('/api/crm/quotations');
    expect(rev1Response.ok(), await rev1Response.text()).toBe(true);
    const rev1 = (await rev1Response.json() as Array<{ id: string; revision: number; total: number; lines: Array<{ quantity: number }>; paymentConditions: string }>)
      .find((quotation) => quotation.id === revisedId);
    expect(rev1).toBeDefined();
    expect(rev1).toMatchObject({ id: revisedId, revision: 1, paymentConditions: '20% advance and balance against negotiated milestones' });
    expect(rev1!.lines[0].quantity).toBe(24);
    expect(rev1!.total).not.toBe(rev0Baseline.total);

    const rev1BaselineResponse = await commercial.page.request.get(`/api/crm/quotations/${revisedId}/baseline`);
    expect(rev1BaselineResponse.ok(), await rev1BaselineResponse.text()).toBe(true);
    const rev1Baseline = await rev1BaselineResponse.json() as { id: string; quotationId: string; revision: number; total: number; lines: Array<{ quantity: number }> };
    expect(rev1Baseline).toMatchObject({ quotationId: revisedId, revision: 1, total: rev1!.total });
    expect(rev1Baseline.id).not.toBe(rev0Baseline.id);
    expect(rev1Baseline.lines[0].quantity).toBe(24);

    const outputRoot = path.resolve(process.cwd(), '../..');
    await mkdir(path.join(outputRoot, 'output/pdf'), { recursive: true });
    await mkdir(path.join(outputRoot, 'outputs/full-aura-audit'), { recursive: true });
    const finalPdfResponse = await sales.page.request.get(`/api/crm/quotations/${revisedId}/pdf`);
    expect(finalPdfResponse.ok(), await finalPdfResponse.text()).toBe(true);
    expect(finalPdfResponse.headers()['content-type']).toBe('application/pdf');
    expect(finalPdfResponse.headers()['content-disposition']).toContain('rev-1.pdf');
    const finalPdfBytes = await finalPdfResponse.body();
    expect(finalPdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(finalPdfBytes.byteLength).toBeGreaterThan(1_500);
    await writeFile(path.join(outputRoot, 'output/pdf/wave2-direct-final-rev1-offer.pdf'), finalPdfBytes);

    const salesWorkbook = await sales.page.request.get(`/api/crm/quotations/${revisedId}/pricing.xlsx`);
    expect(salesWorkbook.status()).toBe(403);
    const workbookResponse = await estimator.page.request.get(`/api/crm/quotations/${revisedId}/pricing.xlsx`);
    expect(workbookResponse.ok(), await workbookResponse.text()).toBe(true);
    expect(workbookResponse.headers()['content-disposition']).toContain('rev-1-internal-pricing.xlsx');
    const workbookBytes = await workbookResponse.body();
    expect(workbookBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await writeFile(path.join(outputRoot, 'outputs/full-aura-audit/wave2-direct-final-rev1-pricing.xlsx'), workbookBytes);

    await sales.page.goto(`/crm/quotations/${revisedId}?focus=revisions`, { waitUntil: 'domcontentloaded' });
    await sales.page.getByRole('tab', { name: /^Revisions/ }).click();
    await expect(sales.page.getByText('Rev 0', { exact: true })).toBeVisible();
    await expect(sales.page.getByText('Rev 1', { exact: true })).toBeVisible();
    await sales.page.getByRole('button', { name: 'Record as sent' }).first().click();
    await expect(sales.page.getByText('Sent', { exact: true }).first()).toBeVisible();
    await sales.page.getByRole('button', { name: 'Record accepted ✓' }).click();
    await expect(sales.page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    const oldAward = await commercial.page.request.post(`/api/crm/quotations/${quotation.id}/convert-to-contract`);
    expect(oldAward.status()).toBe(400);
    const awarded = await commercial.page.request.post(`/api/crm/quotations/${revisedId}/convert-to-contract`, {
      data: { quotationId: quotation.id, commercialBaselineId: rev0Baseline.id },
    });
    expect(awarded.ok(), await awarded.text()).toBe(true);
    const contract = await awarded.json() as { id: string; value: number; acceptedQuotationId: string; acceptedQuotationRevisionId: string; commercialBaselineId: string };
    expect(contract).toMatchObject({
      value: rev1Baseline.total,
      acceptedQuotationId: revisedId,
      acceptedQuotationRevisionId: revisedId,
      commercialBaselineId: rev1Baseline.id,
    });

    const frozenOldAgain = await commercial.page.request.get(`/api/crm/quotations/${quotation.id}/baseline`);
    expect(await frozenOldAgain.json()).toMatchObject({ id: rev0Baseline.id, total: rev0Baseline.total, revision: 0 });
  } finally {
    await Promise.allSettled(contexts.reverse().map((context) => context.close()));
    await Promise.allSettled(users.reverse().map((userId) =>
      admin.request.delete(`/api/admin/users/${encodeURIComponent(userId)}`, { timeout: 15_000 })));
  }
});
