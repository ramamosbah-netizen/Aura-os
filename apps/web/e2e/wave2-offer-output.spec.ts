import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scoped } from './fixtures';
import { apiAuthHeaders } from './api-auth';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

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
  await configureCompany(request);
  const adminHeaders = apiAuthHeaders();
  expect(adminHeaders.Authorization, 'Auth-ON proof requires the administrator token from global setup').toBeTruthy();
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const checkerLogin = await request.post(`${API}/auth/login`, { data: { username: 'u-e2e-checker', password } });
  expect(checkerLogin.ok(), await checkerLogin.text()).toBe(true);
  const checkerToken = ((await checkerLogin.json()) as { token: string }).token;
  const checkerHeaders = { Authorization: `Bearer ${checkerToken}` };

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
      title: 'CCTV technical proposal basis', inputRevision: 'Client specification Rev 03', reviewerId: 'u-e2e-checker',
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
    headers: checkerHeaders, data: { comment: 'Technical basis approved for customer proposal' },
  });
  expect(studyApproval.ok(), await studyApproval.text()).toBe(true);

  expect((await request.patch(`/api/tendering/tenders/${tender.id}/status`, { data: { status: 'estimating' } })).ok()).toBe(true);
  const takeoffResponse = await request.post(`/api/tendering/tenders/${tender.id}/quantity-takeoff`, {
    data: { lines: [{ description: 'IP camera complete', unit: 'no', quantity: 24 }] },
  });
  expect(takeoffResponse.ok(), await takeoffResponse.text()).toBe(true);
  const takeoff = await takeoffResponse.json() as { id: string };
  const takeoffApproval = await request.post(`${API}/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/approve`, { headers: checkerHeaders });
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
  const quoteApproval = await request.patch(`${API}/crm/quotations/${quote.id}/status`, { headers: checkerHeaders, data: { action: 'approve' } });
  expect(quoteApproval.ok(), await quoteApproval.text()).toBe(true);

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
});
