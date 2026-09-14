import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scoped } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const ROLE_PASSWORD = 'Aura-Wave2-Tender-Roles-2026!';

async function createApiRoleUser(
  request: import('@playwright/test').APIRequestContext,
  suffix: string,
  displayName: string,
  roleId: string,
): Promise<{ id: string; headers: { Authorization: string } }> {
  const id = `wave2-tender-${suffix}-${Date.now()}`;
  const created = await request.post('/api/admin/users', { data: { userId: id, displayName, email: `${id}@example.invalid` } });
  expect(created.ok(), await created.text()).toBe(true);
  const credential = await request.post(`/api/admin/users/${encodeURIComponent(id)}/password`, {
    data: { password: ROLE_PASSWORD, mustChange: false },
  });
  expect(credential.ok(), await credential.text()).toBe(true);
  const grant = await request.post('/api/admin/access/grants', { data: { userId: id, roleId } });
  expect(grant.ok(), await grant.text()).toBe(true);
  const login = await request.post(`${API}/auth/login`, { data: { username: id, password: ROLE_PASSWORD } });
  expect(login.ok(), await login.text()).toBe(true);
  const token = ((await login.json()) as { token: string }).token;
  return { id, headers: { Authorization: `Bearer ${token}` } };
}

async function makeApprovalReady(
  request: import('@playwright/test').APIRequestContext,
  headers: Record<string, string>,
  quotationId: string,
): Promise<void> {
  const seeded = await request.post(`${API}/document-requirements/seed`, {
    headers, data: { entityType: 'crm.quotation', entityId: quotationId },
  });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const listed = await request.get(`${API}/document-requirements?entityType=crm.quotation&entityId=${quotationId}`, { headers });
  expect(listed.ok(), await listed.text()).toBe(true);
  const body = await listed.json() as { requirements: Array<{ id: string }> };
  for (const row of body.requirements) {
    const waived = await request.post(`${API}/document-requirements/${row.id}/waive`, {
      headers, data: { reason: 'Wave 2 final-revision closure fixture' },
    });
    expect(waived.ok(), await waived.text()).toBe(true);
  }
}

async function configureCompany(request: import('@playwright/test').APIRequestContext): Promise<void> {
  for (const [key, value] of [
    ['company.name', 'AURA MEP Systems Test LLC'],
    ['company.legalName', 'AURA MEP Systems Test L.L.C.'],
    ['company.trn', '100999999999999'],
    ['company.address', 'Dubai, United Arab Emirates'],
    ['finance.defaultCurrency', 'AED'],
  ]) {
    const configured = await request.post('/api/admin/settings', { data: { key, value, description: 'Wave 2 output proof' } });
    expect(configured.ok(), await configured.text()).toBe(true);
  }
}

test('downloads a real customer quotation PDF from the governed quotation record', async ({ request }) => {
  await configureCompany(request);
  const quoteNumber = `W2-${Date.now()}`;
  const created = await request.post('/api/crm/quotations', {
    data: {
      quoteNumber,
      customerName: scoped('Wave 2 PDF customer'),
      subject: 'CCTV supply, installation, testing and commissioning',
      issueDate: '2026-09-14',
      validUntil: '2026-10-14',
      paymentConditions: '30% advance, balance against agreed milestones.',
      deliveryTerms: 'Delivery subject to approved material submittal and site readiness.',
      exclusions: ['Builder works unless listed in the approved scope.'],
      lines: [
        { description: 'IP camera', quantity: 24, unit: 'no', unitPrice: 125, vatRate: 5, sourceItemId: 'camera-line' },
        { description: 'Network video recorder', quantity: 1, unit: 'no', unitPrice: 1200, vatRate: 5, sourceItemId: 'nvr-line' },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const quotation = await created.json() as { id: string; total: number };
  expect(quotation.total).toBe(4410);

  const identityResponse = await request.get(`/api/crm/quotations/${quotation.id}/document-identity`);
  expect(identityResponse.ok(), await identityResponse.text()).toBe(true);
  const identity = await identityResponse.json() as { name: string; configured: boolean; currency: string };
  expect(identity.configured).toBe(true);
  expect(identity.name).not.toBe('Company identity not configured');
  expect(identity.currency).toBeTruthy();

  const response = await request.get(`/api/crm/quotations/${quotation.id}/pdf`);
  expect(response.ok(), await response.text()).toBe(true);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['content-disposition']).toContain(`${quoteNumber}-rev-0.pdf`);
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(1_500);

  const outputDir = path.resolve(process.cwd(), '../../output/pdf');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'wave2-quotation-proof.pdf'), bytes);

});

test('downloads governed Tender pricing and technical outputs from their clear workspaces', async ({ request, page }) => {
  test.setTimeout(360_000);
  page.setDefaultTimeout(20_000);
  const users: string[] = [];
  try {
  await configureCompany(request);
  const adminHeaders = apiAuthHeaders();
  expect(adminHeaders.Authorization, 'Auth-ON proof requires the administrator token from global setup').toBeTruthy();
  const technical = await createApiRoleUser(request, 'technical', 'Wave 2 Tender Technical Manager', 'r-technical-manager');
  const commercial = await createApiRoleUser(request, 'commercial', 'Wave 2 Tender Commercial Manager', 'r-commercial-manager');
  users.push(technical.id, commercial.id);

  const tenderCreated = await request.post('/api/tendering/tenders', {
    data: { title: scoped('Wave 2 governed CCTV Tender'), reference: `W2-TDR-${Date.now()}`, accountName: 'Wave 2 fictional client', value: 0 },
  });
  expect(tenderCreated.ok(), await tenderCreated.text()).toBe(true);
  const tender = await tenderCreated.json() as { id: string; reference: string };
  const bidDecision = await request.post(`${API}/tendering/bid-scores`, {
    headers: adminHeaders,
    data: { tenderId: tender.id, criteria: [{ name: 'Strategic fit', weight: 1, score: 8 }], notes: 'Wave 2 governed browser fixture' },
  });
  expect(bidDecision.ok(), await bidDecision.text()).toBe(true);
  const studyCreated = await request.post(`/api/tendering/tenders/${tender.id}/studies`, {
    data: {
      title: 'CCTV technical proposal basis', inputRevision: 'Client specification Rev 03', reviewerId: technical.id,
      scopeSummary: 'Supply, install, test and commission 24 IP cameras with 30-day retention.',
      systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'IP cameras and NVR', interfaces: ['LAN', 'UPS'] }],
      requirements: [{ category: 'client', statement: '30-day video retention', acceptanceCriteria: 'Playback proves 30 days', sourceRef: 'Specification 7.2', compliance: 'compliant', response: 'Included' }],
      surveyFindings: [{ area: 'Control room', observation: 'Existing rack has capacity', impact: 'Reuse rack after approval', evidenceDocumentIds: [] }],
      clarifications: [{ question: 'Confirm VLAN', requestedFrom: 'Client IT', dueDate: null, status: 'closed', answer: 'Dedicated VLAN', reference: 'RFI-01' }],
      deviations: [], assumptions: ['Normal working hours'], exclusions: ['Builder works'], evidence: [],
    },
  });
  expect(studyCreated.ok(), await studyCreated.text()).toBe(true);
  const study = await studyCreated.json() as { id: string; revisionNo: number };
  expect((await request.post(`/api/tendering/tenders/${tender.id}/studies/${study.id}/submit`)).ok()).toBe(true);
  const studyApproval = await request.post(`${API}/tendering/tenders/${tender.id}/studies/${study.id}/approve`, {
    headers: technical.headers, data: { comment: 'Technical basis approved for customer proposal' },
  });
  expect(studyApproval.ok(), await studyApproval.text()).toBe(true);

  expect((await request.patch(`/api/tendering/tenders/${tender.id}/status`, { data: { status: 'estimating' } })).ok()).toBe(true);
  const takeoffResponse = await request.post(`/api/tendering/tenders/${tender.id}/quantity-takeoff`, {
    data: { lines: [{ description: 'IP camera complete', unit: 'no', quantity: 24 }] },
  });
  expect(takeoffResponse.ok(), await takeoffResponse.text()).toBe(true);
  const takeoff = await takeoffResponse.json() as { id: string };
  const takeoffApproval = await request.post(`${API}/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/approve`, { headers: technical.headers });
  expect(takeoffApproval.ok(), await takeoffApproval.text()).toBe(true);
  const projectionResponse = await request.post(`/api/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/project-to-boq`);
  expect(projectionResponse.ok(), await projectionResponse.text()).toBe(true);
  const projection = await projectionResponse.json() as { boq: { sourceBasisRevisionId: string }; items: Array<{ id: string }> };
  expect(projection.boq.sourceBasisRevisionId).toBe(takeoff.id);
  const item = projection.items[0];
  const estimate = await request.post(`${API}/tendering/estimates`, {
    headers: adminHeaders,
    data: { boqItemId: item.id, components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 100 }], applyToBoq: false },
  });
  expect(estimate.ok(), await estimate.text()).toBe(true);

  await page.goto(`/tendering/tenders/${tender.id}/boq`);
  await expect(page.getByRole('heading', { name: 'Prepare quantities before pricing' })).toBeVisible();
  await expect(page.getByText('1 ✓ Approved study')).toBeVisible();
  await expect(page.getByText('3 ✓ Technical approval')).toBeVisible();
  await expect(page.getByText('4 ✓ BOQ ready')).toBeVisible();
  await expect(page.getByText('BOQ is linked and ready for costing ✓')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Commercial BOQ & Costing' })).toBeVisible();
  await expect(page.getByText('Quantities locked to technical-study:S-001:Client specification Rev 03.')).toBeVisible();
  await expect(page.getByText('Linked ✓')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Line Item' })).toHaveCount(0);

  await page.goto(`/tendering/tenders/${tender.id}/pricing`);
  await expect(page.getByText('INTERNAL — cost & resource breakdown')).toBeVisible();
  await expect(page.getByText('IP camera complete')).toBeVisible();
  const workbookLink = page.getByRole('link', { name: 'Download pricing workbook (.xlsx)' });
  await expect(workbookLink).toBeVisible();
  const [workbookDownload] = await Promise.all([
    page.waitForEvent('download'),
    workbookLink.click(),
  ]);
  expect(workbookDownload.suggestedFilename()).toContain('internal-pricing.xlsx');
  const workbookPath = path.resolve(process.cwd(), '../../outputs/full-aura-audit/wave2-tender-pricing-proof.xlsx');
  await workbookDownload.saveAs(workbookPath);
  const workbookBytes = await import('node:fs/promises').then(({ readFile }) => readFile(workbookPath));
  expect(workbookBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  expect((await request.patch(`/api/tendering/tenders/${tender.id}/status`, { data: { status: 'priced' } })).ok()).toBe(true);
  const quoteResponse = await request.post(`/api/tendering/tenders/${tender.id}/quotation`, { data: { vatRate: 5 } });
  expect(quoteResponse.ok(), await quoteResponse.text()).toBe(true);
  const quote = await quoteResponse.json() as { id: string; quoteNumber: string };
  expect((await request.patch(`/api/crm/quotations/${quote.id}/status`, { data: { action: 'submit_review' } })).ok()).toBe(true);

  const seeded = await request.post(`${API}/document-requirements/seed`, { headers: adminHeaders, data: { entityType: 'crm.quotation', entityId: quote.id } });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const checklistResponse = await request.get(`${API}/document-requirements?entityType=crm.quotation&entityId=${quote.id}`, { headers: adminHeaders });
  expect(checklistResponse.ok(), await checklistResponse.text()).toBe(true);
  const checklist = await checklistResponse.json() as { requirements: Array<{ id: string; type: string; requiredCount: number }> };
  for (const row of checklist.requirements) {
    for (let index = 0; index < row.requiredCount; index += 1) {
      let reference = `W2-external-vendor-${index + 1}`;
      let type = 'EXTERNAL_REFERENCE';
      if (row.type !== 'VENDOR_QUOTE') {
        const docResponse = await request.post(`${API}/documents`, {
          headers: adminHeaders,
          data: { title: `W2 ${row.type}`, kind: row.type, aggregateType: 'crm.quotation', aggregateId: quote.id, content: 'Wave 2 isolated browser evidence.' },
        });
        expect(docResponse.ok(), await docResponse.text()).toBe(true);
        const doc = await docResponse.json() as { document?: { id: string }; id?: string };
        reference = doc.document?.id ?? doc.id!;
        type = 'DOCUMENT_ID';
      }
      const evidence = await request.post(`${API}/document-requirements/${row.id}/evidence`, { headers: adminHeaders, data: { type, reference } });
      expect(evidence.ok(), await evidence.text()).toBe(true);
    }
  }
  const quoteApproval = await request.patch(`${API}/crm/quotations/${quote.id}/status`, { headers: commercial.headers, data: { action: 'approve' } });
  expect(quoteApproval.ok(), await quoteApproval.text()).toBe(true);
  const rev0BaselineResponse = await request.get(`${API}/crm/quotations/${quote.id}/baseline`, { headers: commercial.headers });
  expect(rev0BaselineResponse.ok(), await rev0BaselineResponse.text()).toBe(true);
  const rev0Baseline = await rev0BaselineResponse.json() as { id: string; quotationId: string; revision: number; total: number; lines: Array<{ quantity: number; sourceItemId?: string | null }> };
  expect(rev0Baseline).toMatchObject({ quotationId: quote.id, revision: 0 });
  expect(rev0Baseline.lines[0].quantity).toBe(24);

  const readinessResponse = await request.get(`/api/tendering/tenders/${tender.id}/submission-readiness`);
  expect(readinessResponse.ok(), await readinessResponse.text()).toBe(true);
  expect(await readinessResponse.json()).toMatchObject({ ready: true, technicalStudyId: study.id, commercialQuotationId: quote.id });
  const pdfResponse = await request.get(`/api/tendering/tenders/${tender.id}/technical-proposal.pdf`);
  expect(pdfResponse.ok(), await pdfResponse.text()).toBe(true);
  expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
  const bytes = await pdfResponse.body();
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(2_000);
  await writeFile(path.resolve(process.cwd(), '../../output/pdf/wave2-technical-proposal-proof.pdf'), bytes);

  // Continue the Tender-sourced commercial record through the customer loop in its canonical
  // Quotation 360 UI. Revision creates a new immutable row and keeps the source Tender relation.
  await page.goto(`/crm/quotations/${quote.id}`);
  await page.getByRole('button', { name: 'Record as sent' }).first().click();
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start negotiation' }).first().click();
  await expect(page.getByText('Under negotiation', { exact: true }).first()).toBeVisible();
  const originalQuotePath = `/crm/quotations/${quote.id}`;
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/crm/quotations/') && url.pathname !== originalQuotePath),
    page.getByRole('button', { name: 'Revise ↺' }).first().click(),
  ]);
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  const revisedQuoteId = new URL(page.url()).pathname.split('/').pop()!;
  const chainResponse = await request.get(`/api/crm/quotations/${revisedQuoteId}/revisions`);
  expect(chainResponse.ok(), await chainResponse.text()).toBe(true);
  const chain = await chainResponse.json() as Array<{ id: string; sourceTenderId: string | null; revision: number; status: string }>;
  expect(chain.map(({ id, sourceTenderId, revision, status }) => ({ id, sourceTenderId, revision, status }))).toEqual([
    { id: quote.id, sourceTenderId: tender.id, revision: 0, status: 'revised' },
    { id: revisedQuoteId, sourceTenderId: tender.id, revision: 1, status: 'draft' },
  ]);

  const oldTerms = await request.patch(`${API}/crm/quotations/${quote.id}/terms`, {
    headers: adminHeaders, data: { paymentConditions: 'forged overwrite' },
  });
  expect(oldTerms.status()).toBe(409);
  const staleRevision = await request.post(`${API}/crm/quotations/${quote.id}/revise`, {
    headers: adminHeaders, data: { parentQuotationId: 'forged-parent', revision: 99 },
  });
  expect(staleRevision.status()).toBe(400);

  // The Tender quotation revision carries its canonical BOQ-derived quantity and cost build-up
  // into the editable pricing workspace. Only the margin policy changes here.
  await page.goto(`/crm/quotations/${revisedQuoteId}/pricing`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Quantity')).toHaveValue('24');
  await expect(page.getByLabel('Unit cost')).toHaveValue('100');
  await page.getByLabel('Target margin %').fill('17');
  await page.getByRole('button', { name: 'Save draft (creates the sheet)' }).click();
  await expect(page.getByText(/Draft saved — sheet v1/)).toBeVisible();
  await page.getByRole('button', { name: /Freeze baseline/ }).click();
  await expect(page.getByText(/Baseline frozen/)).toBeVisible();
  await page.getByRole('button', { name: /Generate quotation/ }).click();
  await expect(page.getByText('Quotation lines generated from the frozen sheet.')).toBeVisible();

  const changeReason = 'Client requested revised delivery phasing before final tender submission.';
  const logged = await request.post('/api/crm/negotiation', {
    data: { quotationId: quote.id, type: 'SCOPE_CHANGED', note: changeReason },
  });
  expect(logged.ok(), await logged.text()).toBe(true);
  await page.goto(`/crm/quotations/${revisedQuoteId}?focus=negotiation`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Negotiation' }).click();
  await expect(page.getByText(changeReason)).toBeVisible();
  await expect(page.getByText('Revision 1')).toBeVisible();

  await page.goto(`/crm/quotations/${revisedQuoteId}?focus=terms`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Terms' }).click();
  await page.getByRole('button', { name: /^(Add|Edit) terms$/ }).first().click();
  await page.getByLabel('Delivery terms').fill('Final negotiated phased delivery against approved programme');
  await page.getByRole('button', { name: 'Save terms' }).click();
  await expect(page.getByText('Final negotiated phased delivery against approved programme')).toBeVisible();

  await makeApprovalReady(request, adminHeaders, revisedQuoteId);
  await page.goto(`/crm/quotations/${revisedQuoteId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Submit for review/ }).first().click();
  await expect(page.getByText(/Internal review/i).first()).toBeVisible();
  const makerCannotApprove = await request.patch(`${API}/crm/quotations/${revisedQuoteId}/status`, {
    headers: adminHeaders, data: { action: 'approve' },
  });
  // The administrator authored this revision through the browser, so the canonical service SoD
  // rejects self-approval even though the role has approval permission.
  expect(makerCannotApprove.status()).toBe(403);
  const finalApproval = await request.patch(`${API}/crm/quotations/${revisedQuoteId}/status`, {
    headers: commercial.headers, data: { action: 'approve' },
  });
  expect(finalApproval.ok(), await finalApproval.text()).toBe(true);

  const finalQuoteResponse = await request.get(`${API}/crm/quotations/${revisedQuoteId}`, { headers: commercial.headers });
  expect(finalQuoteResponse.ok(), await finalQuoteResponse.text()).toBe(true);
  const finalQuote = await finalQuoteResponse.json() as { id: string; revision: number; total: number; sourceTenderId: string; lines: Array<{ quantity: number; sourceItemId?: string | null }> };
  expect(finalQuote).toMatchObject({ id: revisedQuoteId, revision: 1, sourceTenderId: tender.id });
  expect(finalQuote.lines[0].quantity).toBe(24);
  expect(finalQuote.total).not.toBe(rev0Baseline.total);
  const finalBaselineResponse = await request.get(`${API}/crm/quotations/${revisedQuoteId}/baseline`, { headers: commercial.headers });
  expect(finalBaselineResponse.ok(), await finalBaselineResponse.text()).toBe(true);
  const finalBaseline = await finalBaselineResponse.json() as { id: string; quotationId: string; revision: number; total: number; lines: Array<{ quantity: number; sourceItemId?: string | null }> };
  expect(finalBaseline).toMatchObject({ quotationId: revisedQuoteId, revision: 1, total: finalQuote.total });
  expect(finalBaseline.id).not.toBe(rev0Baseline.id);
  expect(finalBaseline.lines[0].quantity).toBe(24);

  // PDF composition lives in the web document route (it combines the governed API record with
  // company identity/settings); exercise the same endpoint the user downloads from Quotation 360.
  const finalPdf = await request.get(`/api/crm/quotations/${revisedQuoteId}/pdf`);
  expect(finalPdf.ok(), await finalPdf.text()).toBe(true);
  expect(finalPdf.headers()['content-disposition']).toContain('rev-1.pdf');
  const finalPdfBytes = await finalPdf.body();
  expect(finalPdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(finalPdfBytes.byteLength).toBeGreaterThan(1_500);
  await writeFile(path.resolve(process.cwd(), '../../output/pdf/wave2-tender-final-rev1-offer.pdf'), finalPdfBytes);
  const finalWorkbook = await request.get(`${API}/crm/quotations/${revisedQuoteId}/pricing.xlsx`, { headers: commercial.headers });
  expect(finalWorkbook.ok(), await finalWorkbook.text()).toBe(true);
  expect(finalWorkbook.headers()['content-disposition']).toContain('rev-1-internal-pricing.xlsx');
  const finalWorkbookBytes = await finalWorkbook.body();
  expect(finalWorkbookBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await writeFile(path.resolve(process.cwd(), '../../outputs/full-aura-audit/wave2-tender-final-rev1-pricing.xlsx'), finalWorkbookBytes);

  await page.goto(`/crm/quotations/${revisedQuoteId}?focus=revisions`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Revisions/ }).click();
  await expect(page.getByText('Rev 0', { exact: true })).toBeVisible();
  await expect(page.getByText('Rev 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record as sent' }).first().click();
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();

  // Submission and award accept no caller-selected quotation/baseline fields. The controller strips
  // those forged keys and resolves the current persisted Tender quotation chain instead.
  const submitted = await request.post(`${API}/tendering/tenders/${tender.id}/submit`, {
    headers: adminHeaders,
    data: {
      method: 'email', reference: `SUB-${tender.reference}-R1`, addendaAcknowledged: 'All received addenda acknowledged',
      notes: 'Final commercial offer Rev 1 submitted', commercialQuotationId: quote.id, commercialBaselineId: rev0Baseline.id,
    },
  });
  expect(submitted.ok(), await submitted.text()).toBe(true);
  expect(await submitted.json()).toMatchObject({ tender: { status: 'submitted' }, submission: { reference: `SUB-${tender.reference}-R1` } });
  const submissions = await request.get(`${API}/tendering/tenders/${tender.id}/submissions`, { headers: adminHeaders });
  expect(submissions.ok(), await submissions.text()).toBe(true);
  expect((await submissions.json()) as Array<{ reference: string }>).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: `SUB-${tender.reference}-R1` }),
  ]));

  const awarded = await request.post(`${API}/tendering/tenders/${tender.id}/award`, {
    headers: adminHeaders,
    data: {
      awardedValue: finalQuote.total, currency: 'AED', awardedAt: '2026-09-14T12:00:00.000Z',
      awardReference: `LOA-${tender.reference}`, quotationId: quote.id, commercialBaselineId: rev0Baseline.id,
    },
  });
  expect(awarded.ok(), await awarded.text()).toBe(true);
  expect(await awarded.json()).toMatchObject({
    status: 'won',
    commercialBasis: { baselineId: finalBaseline.id, quotationId: revisedQuoteId, value: finalBaseline.total },
  });
  // Contract creation is an outbox-driven handoff. Wait for the event consumer instead of racing
  // the immediate HTTP response from the award transaction.
  let contracts: Array<{ value: number; acceptedQuotationId: string; acceptedQuotationRevisionId: string; commercialBaselineId: string }> = [];
  await expect.poll(async () => {
    const contractsResponse = await request.get(`${API}/contracts/contracts?tenderId=${tender.id}`, { headers: adminHeaders });
    expect(contractsResponse.ok(), await contractsResponse.text()).toBe(true);
    contracts = await contractsResponse.json() as typeof contracts;
    return contracts.length;
  }, { timeout: 15_000 }).toBe(1);
  expect(contracts).toHaveLength(1);
  expect(contracts[0]).toMatchObject({
    value: finalBaseline.total,
    acceptedQuotationId: revisedQuoteId,
    acceptedQuotationRevisionId: revisedQuoteId,
    commercialBaselineId: finalBaseline.id,
  });
  } finally {
    await Promise.allSettled(users.reverse().map((userId) =>
      request.delete(`/api/admin/users/${encodeURIComponent(userId)}`, { timeout: 15_000 })));
  }
});
