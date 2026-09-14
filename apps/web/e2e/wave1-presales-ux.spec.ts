import { expect, test } from '@playwright/test';

test.describe('Wave 1 Pre-Sales UX', () => {
  test('keeps Tender 360 as a dashboard, explains qualification and launches specialist workspaces', async ({ page }) => {
    const created = await page.request.post('/api/tendering/tenders', {
      data: { title: `Wave 1 browser tender ${Date.now()}`, value: 1000 },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const tender = await created.json() as { id: string };

    await page.goto(`/tendering/tenders/${tender.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Technical Study' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bill of Quantities/ })).toHaveCount(0);
    const submissionReadiness = page.getByLabel('Tender submission readiness');
    await expect(submissionReadiness).toContainText('Before submitting');
    await expect(submissionReadiness).toContainText('Technical Study approved');
    await expect(submissionReadiness).toContainText('Commercial offer internally approved');
    await expect(page.getByRole('button', { name: 'Submit Tender' })).toBeDisabled();
    await page.getByRole('button', { name: '+ Assess Go/No-Go' }).click();
    const strategicFit = page.getByRole('button', { name: /Strategic fit/ });
    await strategicFit.hover();
    await expect(page.getByRole('tooltip')).toContainText('Contribution = score × weight ÷ total weight × 10');
    await page.getByRole('button', { name: /Confirm & lock/ }).click();
    await expect(page.getByText('Confirmed and registered · Ratings and decision are locked.')).toBeVisible();
    await expect(page.getByLabel('Strategic fit score')).toHaveCount(0);
    await page.getByRole('button', { name: 'Governed amendment' }).click();
    const amendmentReason = page.getByLabel('Amendment reason');
    await expect(amendmentReason).toBeVisible();
    const confirmAmendment = page.getByRole('button', { name: /Confirm new locked/ });
    await expect(confirmAmendment).toBeDisabled();
    await amendmentReason.fill('Client issued a material scope clarification');
    await confirmAmendment.click();
    await expect(page.getByText(/2 assessments/)).toBeVisible();
    await page.getByRole('button', { name: /Show 1 earlier assessment/ }).click();
    await expect(page.getByText('Superseded because: Client issued a material scope clarification', { exact: true })).toBeVisible();

    await page.getByLabel('Evidence type').selectOption('client_specification');
    await page.getByLabel('Evidence title').fill('Tender client specification · Browser Rev A');
    await page.getByLabel('Source file · up to 25 MB').setInputFiles({
      name: 'tender-client-spec-browser-rev-a.txt', mimeType: 'text/plain', buffer: Buffer.from('tender browser revision A'),
    });
    await page.getByRole('button', { name: 'Upload study evidence' }).click();
    await expect(page.getByText(/Study evidence uploaded and linked to this Tender/)).toBeVisible();
    await expect(page.getByText('Tender client specification · Browser Rev A')).toBeVisible();
    await page.getByLabel('Upload a new revision for Tender client specification · Browser Rev A').setInputFiles({
      name: 'tender-client-spec-browser-rev-b.txt', mimeType: 'text/plain', buffer: Buffer.from('tender browser revision B'),
    });
    await expect(page.getByText(/Revision 2 uploaded for Tender client specification/)).toBeVisible();
    await expect(page.getByText(/client specification · revision 2/i)).toBeVisible();

    await page.getByLabel('Use Tender client specification · Browser Rev A in this study revision').check();
    await page.getByLabel('Study title').fill('Structured CCTV tender study · Browser');
    await page.getByLabel('Input revision').fill('Client specification Rev B');
    const reviewer = page.getByLabel('Technical reviewer');
    const reviewerId = await reviewer.locator('option').evaluateAll((options) => options
      .map((option) => (option as HTMLOptionElement).value)
      .find((value) => Boolean(value) && value !== 'u-admin') ?? '');
    expect(reviewerId, 'an independent technical reviewer must be available').toBeTruthy();
    await reviewer.selectOption(reviewerId);
    await page.getByLabel('Scope summary').fill('CCTV coverage, recording, interfaces and client acceptance requirements for this tender.');
    await page.getByLabel('Design basis 1').fill('IP CCTV with 30-day retention');
    await page.getByLabel('Requirement statement 1').fill('Provide compliant CCTV coverage and recording');
    await page.getByLabel('Acceptance criteria 1').fill('Approved layouts and 30-day retention');
    await page.getByLabel('Technical response 1').fill('Included in the proposed design');
    await page.getByLabel('Compliance 1').selectOption('compliant');
    await page.getByRole('button', { name: 'Create study draft' }).click();
    await expect(page.getByText(/S-001 · draft/i)).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Study title')).toHaveValue('Structured CCTV tender study · Browser');
    await expect(page.getByLabel('Use Tender client specification · Browser Rev A in this study revision')).toBeChecked();
    await page.getByRole('button', { name: 'Submit for technical review' }).click();
    await expect(page.getByText(/S-001 · in review/i)).toBeVisible();

    const contextAfterWork = await page.locator('#qualification').evaluate((qualification) => {
      const context = document.querySelector('[data-testid="tender-360-context"]');
      return !!context && Boolean(qualification.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(contextAfterWork).toBe(true);

    await page.getByRole('link', { name: /BOQ workspace/ }).click();
    await expect(page).toHaveURL(new RegExp(`/tendering/tenders/${tender.id}/boq`));
    const tabs = await page.evaluate(() => JSON.parse(localStorage.getItem('aura.record-tabs') ?? '[]') as Array<{ href: string; type: string }>);
    expect(tabs).toEqual(expect.arrayContaining([expect.objectContaining({ href: `/tendering/tenders/${tender.id}/boq` })]));
  });

  test('uploads and versions governed study evidence from the direct Technical Study workspace', async ({ page }) => {
    const created = await page.request.post('/api/crm/opportunities', {
      data: { title: `Wave 1 browser direct study ${Date.now()}`, executionType: 'direct_sale', value: 1000 },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const opportunity = await created.json() as { id: string };

    await page.goto(`/crm/opportunities/${opportunity.id}?area=study`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Technical Study' })).toBeVisible();
    await page.getByLabel('Evidence type').selectOption('client_specification');
    await page.getByLabel('Evidence title').fill('Client CCTV specification · Browser Rev A');
    await page.getByLabel('Source file · up to 25 MB').setInputFiles({
      name: 'client-cctv-browser-rev-a.txt', mimeType: 'text/plain', buffer: Buffer.from('browser revision A'),
    });
    await page.getByRole('button', { name: 'Upload study evidence' }).click();
    await expect(page.getByRole('status')).toContainText('uploaded and linked');
    await expect(page.getByText('Client CCTV specification · Browser Rev A')).toBeVisible();
    await expect(page.getByText(/client specification · revision 1/i)).toBeVisible();

    await page.getByLabel('Upload a new revision for Client CCTV specification · Browser Rev A').setInputFiles({
      name: 'client-cctv-browser-rev-b.txt', mimeType: 'text/plain', buffer: Buffer.from('browser revision B'),
    });
    await expect(page.getByRole('status')).toContainText('Revision 2 uploaded');
    await expect(page.getByText(/client specification · revision 2/i)).toBeVisible();
  });

  test('lets Sales capture enquiry documents once from the Lead workspace', async ({ page }) => {
    const companyName = `Fictional browser client ${Date.now()}`;
    const created = await page.request.post('/api/crm/leads', {
      data: {
        name: `Wave 1 browser enquiry ${Date.now()}`,
        companyName,
        requirement: 'CCTV drawings and client specification required for study',
        systems: ['cctv'],
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const lead = await created.json() as { id: string };

    await page.goto(`/crm/leads/${lead.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText('Enquiry documents', { exact: true })).toBeVisible();
    await expect(page.getByText(/Upload the client enquiry, drawings, specifications and requirements once/)).toBeVisible();
    await page.getByLabel('Enquiry document type').selectOption('client_specification');
    await page.getByLabel('Enquiry document title').fill('Client CCTV specification · Browser intake');
    await page.getByLabel('Enquiry source file').setInputFiles({
      name: 'client-cctv-browser-intake-r1.txt', mimeType: 'text/plain', buffer: Buffer.from('browser intake revision 1'),
    });
    await page.getByRole('button', { name: 'Upload document' }).click();
    await expect(page.getByRole('status')).toContainText('will follow the Opportunity and Technical Study automatically');
    await expect(page.getByText('Client CCTV specification · Browser intake')).toBeVisible();
    await expect(page.getByText(/client specification · v1/i)).toBeVisible();

    await page.getByLabel('Upload a new revision for Client CCTV specification · Browser intake').setInputFiles({
      name: 'client-cctv-browser-intake-r2.txt', mimeType: 'text/plain', buffer: Buffer.from('browser intake revision 2'),
    });
    await expect(page.getByRole('status')).toContainText('Revision 2 saved');
    await expect(page.getByText(/client specification · v2/i)).toBeVisible();

    const qualified = await page.request.patch(`/api/crm/leads/${lead.id}`, { data: { status: 'qualified' } });
    expect(qualified.ok(), await qualified.text()).toBe(true);
    const conversion = await page.request.post(`/api/crm/leads/${lead.id}/convert`, { data: { requiresTender: false } });
    expect(conversion.ok(), await conversion.text()).toBe(true);
    const opportunity = (await conversion.json() as { opportunity: { id: string } }).opportunity;
    await page.goto(`/crm/opportunities/${opportunity.id}?area=study`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sales-intake-context')).toContainText(companyName);
    await expect(page.getByTestId('sales-intake-context')).toContainText('CCTV drawings and client specification required for study');
    await expect(page.getByText('Client CCTV specification · Browser intake')).toBeVisible();
    await expect(page.getByText(/revision 2 · from Sales enquiry/i)).toBeVisible();
    await expect(page.getByText('Sales maintains revisions')).toBeVisible();
    await expect(page.getByLabel('Upload a new revision for Client CCTV specification · Browser intake')).toHaveCount(0);
  });

  test('lets a real Sales Manager session govern a locked qualification decision', async ({ page, browser }) => {
    const userId = `wave1-sales-manager-${Date.now()}`;
    const password = 'Aura-Wave1-Manager-2026!';
    const createdUser = await page.request.post('/api/admin/users', {
      data: { userId, displayName: 'Wave 1 Sales Manager', email: `${userId}@example.invalid` },
    });
    expect(createdUser.ok(), await createdUser.text()).toBe(true);
    try {
      const credential = await page.request.post(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
        data: { password, mustChange: false },
      });
      expect(credential.ok(), await credential.text()).toBe(true);
      const grant = await page.request.post('/api/admin/access/grants', { data: { userId, roleId: 'r-sales-manager' } });
      expect(grant.ok(), await grant.text()).toBe(true);
      const createdTender = await page.request.post('/api/tendering/tenders', {
        data: { title: `Wave 1 manager qualification ${Date.now()}`, value: 2500 },
      });
      expect(createdTender.ok(), await createdTender.text()).toBe(true);
      const tender = await createdTender.json() as { id: string };
      const initialDecision = await page.request.post('/api/tendering/bid-scores', {
        data: { tenderId: tender.id, criteria: [{ name: 'Strategic fit', weight: 1, score: 8 }], notes: 'Initial locked decision' },
      });
      expect(initialDecision.ok(), await initialDecision.text()).toBe(true);

      const managerContext = await browser.newContext({ baseURL: `http://localhost:${process.env.WEB_PORT ?? 3100}` });
      try {
        const managerPage = await managerContext.newPage();
        await managerPage.goto('/login', { waitUntil: 'domcontentloaded' });
        await managerPage.getByTestId('login-username').fill(userId);
        await managerPage.getByTestId('login-password').fill(password);
        await managerPage.getByTestId('login-submit').click();
        await managerPage.waitForURL((url) => !url.pathname.startsWith('/login'));
        await managerPage.goto(`/tendering/tenders/${tender.id}#qualification`, { waitUntil: 'domcontentloaded' });
        await expect(managerPage.getByText('Confirmed and registered · Ratings and decision are locked.')).toBeVisible();
        await managerPage.getByRole('button', { name: 'Governed amendment' }).click();
        await managerPage.getByLabel('Amendment reason').fill('Manager reassessment after client addendum');
        await managerPage.getByRole('button', { name: /Confirm new locked/ }).click();
        await expect(managerPage.getByText(/2 assessments/)).toBeVisible();
        await expect(managerPage.getByText(userId, { exact: true })).toBeVisible();
      } finally {
        await managerContext.close();
      }
    } finally {
      await page.request.delete(`/api/admin/users/${encodeURIComponent(userId)}`);
    }
  });
});
