import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, SettingsService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import * as XLSX from 'xlsx';

const binaryParser = (response: IncomingMessage, callback: (error: Error | null, body?: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error) => callback(error));
};

/**
 * A minimal, structurally valid one-page PDF: header, catalog, page tree, one page, a cross-reference
 * table with correct byte offsets, and a trailer. A `drawing` may hold only PDF, CAD or image content,
 * checked from the bytes (core/src/dms/file-type-policy.ts, XOP-09), so a drawing fixture has to BE
 * one — plain text named as a drawing is refused 400, which is the policy working, not the fixture's
 * point. The label rides in a comment so each upload stays distinguishable.
 */
function minimalPdf(label: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
  ];
  let body = `%PDF-1.4\n% ${label}\n`;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// Readable characterization for the J1 audit, not acceptance of the observed gaps.
// All writes are isolated in-memory fixtures. Fallbacks are explicitly recorded;
// an admin continuation does not count as completion by the intended employee.
it('records J1 intake, handoff and scope-to-estimate observations with Auth ON', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  const previousStorage = process.env.DMS_STORAGE_DIR;
  const storageDir = await mkdtemp(join(tmpdir(), 'aura-j1-evidence-'));
  process.env.AUTH_JWT_SECRET = 'isolated-j1-audit-secret';
  process.env.DMS_STORAGE_DIR = storageDir;
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const access = app.get(AccessService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    const tenantId = 'j1-audit-only';
    await app.get(SettingsService).set(tenantId, 'company.name', 'J1 Audit MEP LLC', 'E2E document identity');
    await app.get(SettingsService).set(tenantId, 'company.legalName', 'J1 Audit MEP L.L.C.', 'E2E legal identity');
    await app.get(SettingsService).set(tenantId, 'company.trn', '100111111111111', 'E2E tax identity');
    access.registerRole({ id: 'j1-scope-author', name: 'Scope author without approval', permissions: ['crm.opportunity.scope', 'crm.opportunity.read'] });
    for (const [userId, roleId] of [['j1-admin', 'r-admin'], ['j1-checker', 'r-admin'], ['j1-sales', 'r-sales'], ['j1-sales-manager', 'r-sales-manager'], ['j1-author', 'j1-scope-author'], ['j1-engineer', 'r-pre-sales'], ['j1-estimator', 'r-estimator'], ['j1-commercial-manager', 'r-commercial-manager'], ['j1-hse', 'r-hse'], ['j1-technical-manager', 'r-technical-manager']]) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: tenantId } });
      app.get(UsersService).save({ tenantId, userId, displayName: userId, active: true });
    }
    const foreignTenantId = 'j1-audit-foreign';
    access.grant({ userId: 'j1-foreign-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: foreignTenantId } });
    app.get(UsersService).save({ tenantId: foreignTenantId, userId: 'j1-foreign-admin', displayName: 'j1-foreign-admin', active: true });
    const client = (userId: string, selectedTenantId = tenantId) => {
      const c = request.agent(app.getHttpServer());
      c.set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: selectedTenantId })}`);
      return c;
    };
    const admin = client('j1-admin');
    const sales = client('j1-sales');
    const salesManager = client('j1-sales-manager');
    const author = client('j1-author');
    const checker = client('j1-checker');
    const engineer = client('j1-engineer');
    const estimator = client('j1-estimator');
    const commercialManager = client('j1-commercial-manager');
    const hse = client('j1-hse');
    const technicalManager = client('j1-technical-manager');
    const foreignAdmin = client('j1-foreign-admin', foreignTenantId);
    const payload = { name: 'J1 fictional buyer', companyName: 'J1 fictional client', email: 'buyer@example.invalid', requirement: '24 cameras with 30-day retention', systems: ['cctv'], projectName: 'J1 study site', projectLocation: 'Fictional site A', expectedTimeline: 'Offer due in 10 days' };
    const intake = await sales.post('/api/v1/crm/leads').send(payload);
    expect(intake.status).toBe(201);
    const lead = intake.body;
    const intakeEvidence = (await sales.post(`/api/v1/crm/leads/${lead.id}/evidence`)
      .field('category', 'client_specification').field('title', 'Client CCTV specification · Sales intake')
      .attach('file', Buffer.from('J1 client specification revision 01'), { filename: 'client-cctv-spec-rev-01.txt', contentType: 'text/plain' })
      .expect(201)).body.document;
    const intakeRevision = (await sales.post(`/api/v1/crm/leads/${lead.id}/evidence/${intakeEvidence.id}/versions`)
      .field('note', 'Client issued revision 02 before qualification')
      .attach('file', Buffer.from('J1 client specification revision 02'), { filename: 'client-cctv-spec-rev-02.txt', contentType: 'text/plain' })
      .expect(201)).body;
    expect(intakeRevision.version).toBe(2);
    const qualify = await sales.patch(`/api/v1/crm/leads/${lead.id}`).send({ status: 'qualified' });
    expect(qualify.status).toBe(200);
    const inboxBefore = await engineer.get('/api/v1/work-items');
    const conversion = await sales.post(`/api/v1/crm/leads/${lead.id}/convert`).send({
      requiresTender: false,
      preSalesAssignment: {
        assigneeId: 'j1-engineer',
        reviewerId: 'j1-technical-manager',
        dueDate: '2026-09-23',
        inputRevision: 'Client enquiry Rev 01',
        deliverables: ['Site survey', 'Requirements matrix', 'Technical study', 'Quantity take-off basis'],
      },
    });
    expect(conversion.status).toBe(201);
    const converted = conversion.body;
    const opp = converted.opportunity;
    expect(opp.leadId).toBe(lead.id);
    const requirements = (await admin.get(`/api/v1/crm/opportunities/${opp.id}/requirements`).expect(200)).body;
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({ title: payload.requirement, priority: 'must', status: 'open' });
    expect(opp.ownerId).toBe('j1-sales');
    expect(converted.preSalesAssignment).toMatchObject({
      member: { opportunityId: opp.id, userId: 'j1-engineer', role: 'PRESALES' },
      reviewerMember: { opportunityId: opp.id, userId: 'j1-technical-manager', role: 'TECHNICAL_REVIEWER' },
      activity: { relatedId: opp.id, assigneeId: 'j1-engineer', dueDate: '2026-09-23' },
    });
    const inboxAfter = await engineer.get('/api/v1/work-items');
    console.log('J1_HANDOFF_OBSERVATION', JSON.stringify({ fixtureRole: 'r-pre-sales', beforeHttp: inboxBefore.status, beforeCount: inboxBefore.body.items?.length, afterHttp: inboxAfter.status, automaticAssignmentVisible: inboxAfter.body.items?.some((item: { id: string }) => item.id === `crm-activity:${converted.preSalesAssignment.activity.id}`), dueDate: converted.preSalesAssignment.activity.dueDate, reviewer: 'j1-technical-manager' }));
    const invalidLead = (await sales.post('/api/v1/crm/leads').send({ name: 'J1 invalid assignment', requirement: 'Validate canonical assignee' }).expect(201)).body;
    await sales.patch(`/api/v1/crm/leads/${invalidLead.id}`).send({ status: 'qualified' }).expect(200);
    const invalidAssignment = await sales.post(`/api/v1/crm/leads/${invalidLead.id}/convert`).send({
      preSalesAssignment: {
        assigneeId: 'missing-user', reviewerId: 'j1-technical-manager', dueDate: '2026-09-23',
        inputRevision: 'Rev 01', deliverables: ['Technical study'],
      },
    });
    expect(invalidAssignment.status).toBe(400);
    const unconvertedLead = (await sales.get(`/api/v1/crm/leads/${invalidLead.id}`).expect(200)).body;
    expect(unconvertedLead).toMatchObject({ status: 'qualified', convertedOpportunityId: null });
    const beforePackageQuote = await admin.post(`/api/v1/crm/opportunities/${opp.id}/convert-to-quotation`);
    expect(beforePackageQuote.status).toBe(400);
    expect(String(beforePackageQuote.body.message)).toMatch(/scope|estimate|pricing/i);
    const lines = [{ lineId: 'camera-line', description: '24 IP cameras', quantity: 24, unit: 'no', sourceLineId: 'manual-line-1' }];
    const base = `/api/v1/crm/opportunities/${opp.id}/pre-award-package`;
    const inheritedIntake = (await engineer.get(`${base}/intake-context`).expect(200)).body;
    expect(inheritedIntake).toMatchObject({
      leadId: lead.id,
      customerContact: payload.name,
      contactEmail: payload.email,
      companyName: payload.companyName,
      requirement: payload.requirement,
      projectName: payload.projectName,
      projectLocation: payload.projectLocation,
      expectedTimeline: payload.expectedTimeline,
      systems: [{ key: 'cctv', label: 'CCTV' }],
    });
    await author.get(`${base}/intake-context`).expect(403);
    const evidenceEndpoint = `${base}/evidence`;
    const salesEvidenceUpload = await sales.post(evidenceEndpoint)
      .field('category', 'drawing').field('title', 'Unauthorized drawing')
      .attach('file', minimalPdf('sales must not upload engineering evidence'), { filename: 'unauthorized.pdf', contentType: 'application/pdf' });
    expect(salesEvidenceUpload.status).toBe(403);
    const uploadedEvidence = (await engineer.post(evidenceEndpoint)
      .field('category', 'client_specification').field('title', 'Client CCTV specification · Rev A')
      .attach('file', Buffer.from('J1 fictional CCTV specification revision A'), { filename: 'client-cctv-spec-rev-a.txt', contentType: 'text/plain' })
      .expect(201)).body;
    const evidenceDocument = uploadedEvidence.document;
    const evidenceVersion = (await engineer.post(`${evidenceEndpoint}/${evidenceDocument.id}/versions`)
      .field('note', 'Client issued revision B')
      .attach('file', Buffer.from('J1 fictional CCTV specification revision B'), { filename: 'client-cctv-spec-rev-b.txt', contentType: 'text/plain' })
      .expect(201)).body;
    expect(evidenceVersion.version).toBe(2);
    const evidenceRegister = (await engineer.get(evidenceEndpoint).expect(200)).body;
    expect(evidenceRegister).toEqual(expect.arrayContaining([expect.objectContaining({
      id: evidenceDocument.id, title: 'Client CCTV specification · Rev A', kind: 'client_specification', currentVersion: 2,
    })]));
    expect(evidenceRegister).toEqual(expect.arrayContaining([expect.objectContaining({
      id: intakeEvidence.id, title: 'Client CCTV specification · Sales intake', kind: 'client_specification', currentVersion: 2,
      source: 'sales-intake', aggregateType: 'crm.lead', aggregateId: lead.id,
    })]));
    const inheritedRevision = await engineer.get(`/api/v1/documents/${intakeEvidence.id}/content?version=2`).expect(200);
    expect(inheritedRevision.text).toBe('J1 client specification revision 02');
    await technicalManager.get(`/api/v1/documents/${intakeEvidence.id}/content?version=2`).expect(200);
    await author.get(`/api/v1/documents/${intakeEvidence.id}/content?version=2`).expect(403);
    const inheritedRevisionAttempt = await engineer.post(`${evidenceEndpoint}/${intakeEvidence.id}/versions`)
      .attach('file', Buffer.from('Pre-Sales must not replace Sales intake'), { filename: 'spoofed-rev.txt', contentType: 'text/plain' });
    expect(inheritedRevisionAttempt.status).toBe(400);
    expect(String(inheritedRevisionAttempt.body.message)).toMatch(/Sales intake evidence is read-only/i);
    const downloadedRevisionA = await engineer.get(`/api/v1/documents/${evidenceDocument.id}/content?version=1`).expect(200);
    const downloadedRevisionB = await engineer.get(`/api/v1/documents/${evidenceDocument.id}/content?version=2`).expect(200);
    expect(downloadedRevisionA.text).toBe('J1 fictional CCTV specification revision A');
    expect(downloadedRevisionB.text).toBe('J1 fictional CCTV specification revision B');
    const foreignOpportunity = (await admin.post('/api/v1/crm/opportunities').send({
      title: 'J1 unrelated direct opportunity', executionType: 'direct_sale', value: 1,
    }).expect(201)).body;
    const foreignEvidence = (await engineer.post(`/api/v1/crm/opportunities/${foreignOpportunity.id}/pre-award-package/evidence`)
      .field('category', 'drawing').field('title', 'Unrelated opportunity drawing')
      .attach('file', minimalPdf('unrelated'), { filename: 'unrelated.pdf', contentType: 'application/pdf' })
      .expect(201)).body.document;
    const studyPayload = {
      title: 'J1 CCTV technical study', inputRevision: 'Client enquiry Rev 01', reviewerId: 'j1-technical-manager',
      scopeSummary: '24 IP cameras with 30-day retention for the fictional J1 site.',
      systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'IP cameras and NVR', interfaces: ['LAN'] }],
      requirements: [{ category: 'client', statement: payload.requirement, acceptanceCriteria: '24 cameras and 30-day retention', sourceRef: `Enquiry ${lead.id}`, sourceRequirementId: requirements[0].id, compliance: 'compliant', response: 'Included in the design basis' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [],
      evidence: [{ documentId: intakeEvidence.id, title: 'caller-spoofed title', kind: 'drawing', revision: '999' }],
    };
    const eligibleReviewers = (await engineer.get(`${base}/reviewers`).expect(200)).body;
    expect(eligibleReviewers.some((row: { userId: string }) => row.userId === 'j1-technical-manager')).toBe(true);
    expect(eligibleReviewers.some((row: { userId: string }) => row.userId === 'j1-engineer')).toBe(false);
    const selfReviewer = await engineer.post(`${base}/studies`).send({ ...studyPayload, reviewerId: 'j1-engineer' });
    expect(selfReviewer.status).toBe(400);
    const ineligibleReviewer = await engineer.post(`${base}/studies`).send({ ...studyPayload, reviewerId: 'j1-author' });
    expect(ineligibleReviewer.status).toBe(400);
    const foreignEvidenceAttempt = await engineer.post(`${base}/studies`).send({
      ...studyPayload,
      evidence: [{ documentId: foreignEvidence.id, title: foreignEvidence.title, kind: foreignEvidence.kind, revision: '1' }],
    });
    expect(foreignEvidenceAttempt.status).toBe(400);
    const study = (await engineer.post(`${base}/studies`).send(studyPayload).expect(201)).body;
    expect(study).toMatchObject({ revisionNo: 1, status: 'draft', authorId: 'j1-engineer', reviewerId: 'j1-technical-manager' });
    expect(study.evidence).toEqual([{
      documentId: intakeEvidence.id, title: 'Client CCTV specification · Sales intake', kind: 'client_specification', revision: '2',
    }]);
    await engineer.post(`${base}/studies/${study.id}/submit`).expect(201);
    const authorStudyApproval = await engineer.post(`${base}/studies/${study.id}/approve`).send({ comment: 'self approval attempt' });
    const salesStudyApproval = await sales.post(`${base}/studies/${study.id}/approve`).send({ comment: 'wrong functional permission' });
    expect(authorStudyApproval.status).toBe(403);
    expect(salesStudyApproval.status).toBe(403);
    const approvedStudy = (await technicalManager.post(`${base}/studies/${study.id}/approve`).send({ comment: 'Technical basis accepted for estimating' }).expect(201)).body;
    expect(approvedStudy.status).toBe('approved');
    const draft = (await author.post(`${base}/scope`).send({ sourceId: 'manual-study', lines }).expect(201)).body;
    expect(draft.sourceId).toBe(study.id);
    expect(draft.sourceRevRef).toContain('technical-study:S-001:Client enquiry Rev 01');
    const explicitApproval = await author.post(`${base}/scope/${draft.id}/approve`);
    const inlineApproval = await author.post(`${base}/scope`).send({ sourceId: 'manual-study-v2', lines, approve: true });
    const salesApproval = await sales.post(`${base}/scope/${draft.id}/approve`);
    expect(explicitApproval.status).toBe(403);
    expect(inlineApproval.status).toBe(400);
    expect(salesApproval.status).toBe(403);
    const approved = (await salesManager.post(`${base}/scope/${draft.id}/approve`).expect(201)).body;
    const altered = await admin.post(`${base}/estimate`).send({ basisRevisionId: approved.id, lines: [{ ...lines[0], quantity: 240 }], buildUps: [{ basisLineId: 'camera-line', components: [{ costType: 'material', description: 'Camera', quantity: 1, unitCost: 100 }] }] });
    expect(altered.status).toBe(400);
    const observations = {
      authOn: auth.enabled, salesRole: 'r-sales', intakeHttp: intake.status, qualifyHttp: qualify.status, convertHttp: conversion.status,
      adminFixtureContinuation: intake.status !== 201 || qualify.status !== 200 || conversion.status !== 201,
      leadLineagePreserved: opp.leadId === lead.id, capturedLeadRequirement: lead.requirement,
      opportunityRequirementsAfterConversion: requirements.length, opportunityOwner: opp.ownerId,
      canonicalIntakeContextPreserved: inheritedIntake.leadId === lead.id && inheritedIntake.projectLocation === payload.projectLocation,
      salesIntakeDocumentIdPreserved: study.evidence[0].documentId === intakeEvidence.id,
      salesIntakeRevisionPreserved: study.evidence[0].revision === '2',
      preSalesInheritedDownloadHttp: inheritedRevision.status,
      unrelatedRoleInheritedDownloadHttp: 403,
      preSalesRevisionAttemptHttp: inheritedRevisionAttempt.status,
      quotationBeforeStudyHttp: beforePackageQuote.status,
      technicalStudyRevision: approvedStudy.revisionNo, technicalStudyStatus: approvedStudy.status,
      technicalStudyAuthor: approvedStudy.authorId, technicalStudyReviewer: approvedStudy.reviewerId,
      authorStudyApprovalHttp: authorStudyApproval.status, wrongFunctionalStudyApprovalHttp: salesStudyApproval.status,
      scopeAuthorPermissions: ['crm.opportunity.scope', 'crm.opportunity.read'], explicitScopeApprovalHttp: explicitApproval.status,
      inlineScopeApprovalHttp: inlineApproval.status, inlineScopeStatus: inlineApproval.body.status,
      salesFunctionalApprovalHttp: salesApproval.status, salesManagerFunctionalApprovalHttp: 201,
      approvedBasisQuantity: approved.lines?.[0]?.quantity, callerEstimateQuantity: 240,
      alteredEstimateHttp: altered.status, alteredEstimateCost: altered.body.estimate?.totals?.estimatedCost,
    };
    console.log('J1_AUDIT_OBSERVATIONS', JSON.stringify(observations));

    // A separate, canonical continuation proves the existing financial chain. This
    // is explicitly two fixture administrators, not sales/engineer role acceptance.
    const canonical = (await admin.post(`${base}/estimate`).send({ basisRevisionId: approved.id, lines, buildUps: [{ basisLineId: 'camera-line', components: [{ costType: 'material', description: 'Camera', quantity: 1, unitCost: 100 }] }] }).expect(201)).body.estimate;
    expect(canonical.totals.estimatedCost).toBe(2400);
    await admin.post(`${base}/estimate/${canonical.id}/freeze`).expect(201);
    const salesEstimateApproval = await sales.post(`${base}/estimate/${canonical.id}/approve`);
    expect(salesEstimateApproval.status).toBe(403);
    await salesManager.post(`${base}/estimate/${canonical.id}/approve`).expect(201);
    const draftPricing = (await admin.post(`${base}/pricing/open`).expect(201)).body;
    await admin.patch(`${base}/pricing/${draftPricing.id}/policy`).send({ method: 'target_margin', percent: 20 }).expect(200);
    const pricing = (await admin.post(`${base}/pricing/${draftPricing.id}/freeze`).expect(201)).body;
    const quote = (await admin.post(`/api/v1/crm/opportunities/${opp.id}/convert-to-quotation`).expect(201)).body;
    console.log('J1_OFFER_SCOPE_OBSERVATION', JSON.stringify({ basisQuantity: 24, quotationLines: quote.lines.map((line: { description: string; quantity: number }) => ({ description: line.description, quantity: line.quantity })) }));
    expect(quote.subtotal).toBe(3000);
    expect(quote.lines).toEqual([expect.objectContaining({
      description: '24 IP cameras', quantity: 24, unit: 'no', sourceItemId: 'camera-line', unitPrice: 125,
    })]);
    const repeated = (await admin.post(`/api/v1/crm/opportunities/${opp.id}/convert-to-quotation`).expect(201)).body;
    expect(repeated.id).toBe(quote.id);
    await admin.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'submit_review' }).expect(200);
    const selfApproval = await admin.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' });
    expect(selfApproval.status).toBe(403);
    const beforeEvidence = await checker.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' });
    expect(beforeEvidence.status).toBe(409);
    const attachEvidence = async (quotationId: string, tenderOffer = false) => {
    await admin.post('/api/v1/document-requirements/seed').send({ entityType: 'crm.quotation', entityId: quotationId }).expect(201);
    const checklist = (await admin.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quotationId}`).expect(200)).body;
    // Real local DMS documents for document references; supplier quotations remain
    // declared external references. This tests readiness mechanics, not content quality.
    for (const row of checklist.requirements) {
      /**
       * On an offer raised from a TENDER, VENDOR_QUOTE is computed from the tender's governed supplier
       * quotations (stage E, 510776b8): a typed reference is refused 409, which is asserted here so the
       * rule stays under test. This tender was never put to suppliers, so it takes the governed
       * exception — a reasoned waiver by the commercial manager who answers for the decision.
       */
      if (tenderOffer && row.type === 'VENDOR_QUOTE') {
        await admin.post(`/api/v1/document-requirements/${row.id}/evidence`).send({ type: 'EXTERNAL_REFERENCE', reference: 'J1-typed-vendor-quote' }).expect(409);
        await commercialManager.post(`/api/v1/document-requirements/${row.id}/waive`)
          .send({ reason: 'J1 fixture: this tender was not put to suppliers; the journey under test is study to offer, not sourcing' }).expect(201);
        continue;
      }
      for (let i = 0; i < row.requiredCount; i++) {
        let reference = `J1-external-vendor-${i + 1}`;
        let type = 'EXTERNAL_REFERENCE';
        if (row.type !== 'VENDOR_QUOTE') {
          const doc = await admin.post('/api/v1/documents').send({ title: `J1 ${row.type}`, kind: row.type, aggregateType: 'crm.quotation', aggregateId: quotationId, content: 'Fictional J1 audit evidence; not a customer deliverable.' });
          expect(doc.status, JSON.stringify(doc.body)).toBe(201);
          reference = doc.body.document?.id ?? doc.body.id;
          type = 'DOCUMENT_ID';
        }
        await admin.post(`/api/v1/document-requirements/${row.id}/evidence`).send({ type, reference }).expect(201);
      }
    }
    };
    await attachEvidence(quote.id);
    const approvedQuote = (await checker.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200)).body;
    expect(approvedQuote.status).toBe('approved');
    const workbookResponse = await admin.get(`/api/v1/crm/quotations/${quote.id}/pricing.xlsx`)
      .buffer(true).parse(binaryParser).expect(200);
    expect(workbookResponse.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const workbook = XLSX.read(workbookResponse.body as Buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Summary', 'Cost Breakdown']);
    const summaryRows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets.Summary, { header: 1 });
    expect(summaryRows).toContainEqual(['Company', 'J1 Audit MEP L.L.C.']);
    expect(summaryRows).toContainEqual(['Total cost', 2400]);
    expect(summaryRows).toContainEqual(['Total sell', 3000]);
    const costRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets['Cost Breakdown']);
    expect(costRows).toEqual([expect.objectContaining({
      Description: '24 IP cameras', Quantity: 24, 'Supply total': 2400,
      Subcontract: 0, 'Total cost': 2400, 'Sell total': 3000,
    })]);
    await estimator.get(`/api/v1/crm/quotations/${quote.id}/pricing.xlsx`).buffer(true).parse(binaryParser).expect(200);
    await commercialManager.get(`/api/v1/crm/quotations/${quote.id}/pricing.xlsx`).buffer(true).parse(binaryParser).expect(200);
    await sales.get(`/api/v1/crm/quotations/${quote.id}`).expect(200);
    await sales.get(`/api/v1/crm/quotations/${quote.id}/document-identity`).expect(200);
    await sales.get(`/api/v1/crm/quotations/${quote.id}/pricing`).expect(403);
    await sales.get(`/api/v1/crm/quotations/${quote.id}/pricing.xlsx`).expect(403);
    await hse.get(`/api/v1/crm/quotations/${quote.id}`).expect(403);
    await hse.get(`/api/v1/crm/quotations/${quote.id}/document-identity`).expect(403);
    await foreignAdmin.get(`/api/v1/crm/quotations/${quote.id}`).expect(404);
    await foreignAdmin.get(`/api/v1/crm/quotations/${quote.id}/document-identity`).expect(404);
    await foreignAdmin.get(`/api/v1/crm/quotations/${quote.id}/pricing.xlsx`).expect(404);
    const workbookOutputDir = join(process.cwd(), '..', '..', 'outputs', 'full-aura-audit');
    await mkdir(workbookOutputDir, { recursive: true });
    await writeFile(join(workbookOutputDir, 'wave2-internal-pricing-proof.xlsx'), workbookResponse.body as Buffer);
    console.log('J1_CANONICAL_CHAIN', JSON.stringify({ authOn: true, fixtureAdministrators: true, quantity: 24, cost: 2400, sellBeforeTax: quote.subtotal, quoteTotal: quote.total, pricingSheetId: pricing.pricingSheetId, quotationId: quote.id, repeatGenerationSameId: true, selfApprovalHttp: selfApproval.status, beforeEvidenceHttp: beforeEvidence.status, finalStatus: approvedQuote.status, internalPricingRolesAllowed: ['r-estimator', 'r-commercial-manager'], salesInternalPricingHttp: 403, unrelatedRoleCustomerOutputSourceHttp: 403, foreignTenantOutputSourceHttp: 404 }));

    // Local lifecycle facts only: this API does not transmit an offer to a client.
    await admin.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'send' }).expect(200);
    await admin.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'negotiate' }).expect(200);
    await admin.post('/api/v1/crm/negotiation').send({ quotationId: quote.id, type: 'DISCOUNT_REQUESTED', party: 'CUSTOMER', percent: 5, note: 'Fictional local audit request only.' }).expect(201);
    const secondPricing = (await admin.post(`${base}/pricing/revision`).expect(201)).body;
    await admin.patch(`${base}/pricing/${secondPricing.id}/policy`).send({ method: 'markup', percent: 20 }).expect(200);
    await admin.post(`${base}/pricing/${secondPricing.id}/freeze`).expect(201);
    const revised = (await admin.post(`/api/v1/crm/opportunities/${opp.id}/convert-to-quotation`).expect(201)).body;
    expect(revised.parentQuotationId).toBe(quote.id);
    expect(revised.subtotal).toBe(2880);
    expect(revised.status).toBe('draft');
    const prematureSend = await admin.patch(`/api/v1/crm/quotations/${revised.id}/status`).send({ action: 'send' });
    expect(prematureSend.status).toBe(400);
    expect(String(prematureSend.body.message)).toMatch(/cannot|draft|approved/i);
    await admin.patch(`/api/v1/crm/quotations/${revised.id}/status`).send({ action: 'submit_review' }).expect(200);
    await attachEvidence(revised.id);
    await checker.patch(`/api/v1/crm/quotations/${revised.id}/status`).send({ action: 'approve' }).expect(200);
    await admin.patch(`/api/v1/crm/quotations/${revised.id}/status`).send({ action: 'send' }).expect(200);
    const accepted = (await admin.patch(`/api/v1/crm/quotations/${revised.id}/status`).send({ action: 'accept' }).expect(200)).body;
    expect(accepted.status).toBe('accepted');
    const revisionLog = (await admin.get(`/api/v1/crm/negotiation?quotationId=${revised.id}`).expect(200)).body;
    // Characterize the reachable coexistence of the earlier legacy quote and the
    // governed chain. Reading either end should describe the same linked chain.
    const rootRevisions = (await admin.get(`/api/v1/crm/quotations/${quote.id}/revisions`).expect(200)).body;
    const leafRevisions = (await admin.get(`/api/v1/crm/quotations/${revised.id}/revisions`).expect(200)).body;
    expect(rootRevisions.map((row: { id: string }) => row.id)).toEqual([quote.id, revised.id]);
    expect(leafRevisions.map((row: { id: string }) => row.id)).toEqual([quote.id, revised.id]);
    console.log('J1_REVISION_CHAIN_PROOF', JSON.stringify({ rootCount: rootRevisions.length, leafCount: leafRevisions.length, parentLinked: revised.parentQuotationId === quote.id, prematureQuotationDenied: beforePackageQuote.status === 400 }));
    console.log('J1_REVISION_OBSERVATION', JSON.stringify({ fixtureAdministrators: true, parentLinked: true, oldSell: 3000, revisedSell: revised.subtotal, requestedDiscountPercent: 5, actualSellReductionPercent: 4, prematureSendHttp: prematureSend.status, finalStatus: accepted.status, revisionMoves: revisionLog.moves }));

    const tender = (await admin.post('/api/v1/tendering/tenders').send({ title: 'J1 fictional MEP tender', value: 3000 }).expect(201)).body;
    const originalBidDecision = (await admin.post('/api/v1/tendering/bid-scores').send({
      tenderId: tender.id,
      criteria: [{ name: 'fit', weight: 1, score: 8 }],
      notes: 'Original J1 qualification decision',
    }).expect(201)).body;
    const unauthorizedAmendment = await sales.post(`/api/v1/tendering/bid-scores/${originalBidDecision.id}/amend`).send({
      criteria: [{ name: 'fit', weight: 1, score: 7 }],
      reason: 'A sales user must not replace a governed decision',
    });
    expect(unauthorizedAmendment.status).toBe(403);
    const amendedBidDecision = (await salesManager.post(`/api/v1/tendering/bid-scores/${originalBidDecision.id}/amend`).send({
      criteria: [{ name: 'fit', weight: 1, score: 7 }],
      notes: 'Reassessed after material client evidence changed',
      reason: 'Client withdrew the mandatory authority approval evidence',
    }).expect(201)).body;
    expect(amendedBidDecision).toMatchObject({
      tenderId: tender.id,
      supersedesId: originalBidDecision.id,
      amendmentReason: 'Client withdrew the mandatory authority approval evidence',
    });
    const bidDecisionHistory = (await admin.get(`/api/v1/tendering/bid-scores?tenderId=${tender.id}`).expect(200)).body;
    expect(bidDecisionHistory).toHaveLength(2);
    expect(bidDecisionHistory.find((row: { id: string }) => row.id === originalBidDecision.id)).toMatchObject({
      id: originalBidDecision.id,
      criteria: originalBidDecision.criteria,
      supersededBy: 'j1-sales-manager',
    });
    expect(bidDecisionHistory.filter((row: { supersededAt: string | null }) => !row.supersededAt)).toHaveLength(1);
    console.log('J1_BID_DECISION_OBSERVATION', JSON.stringify({
      originalDecisionId: originalBidDecision.id,
      originalRecommendation: originalBidDecision.recommendation,
      amendmentHttp: 201,
      unauthorizedAmendmentHttp: unauthorizedAmendment.status,
      replacementDecisionId: amendedBidDecision.id,
      replacementRecommendation: amendedBidDecision.recommendation,
      historyCount: bidDecisionHistory.length,
      activeDecisionCount: bidDecisionHistory.filter((row: { supersededAt: string | null }) => !row.supersededAt).length,
      originalCriteriaPreserved: true,
    }));

    const tenderEvidence = (await engineer.post(`/api/v1/tendering/tenders/${tender.id}/study-files`)
      .field('category', 'client_specification').field('title', 'Tender MEP specification · Rev 02')
      .attach('file', Buffer.from('J1 tender MEP specification revision 02'), { filename: 'tender-mep-spec-rev-02.txt', contentType: 'text/plain' })
      .expect(201)).body.document;
    const tenderEvidenceRevision = (await engineer.post(`/api/v1/tendering/tenders/${tender.id}/study-files/${tenderEvidence.id}/versions`)
      .field('note', 'Tender addendum revision 03')
      .attach('file', Buffer.from('J1 tender MEP specification revision 03'), { filename: 'tender-mep-spec-rev-03.txt', contentType: 'text/plain' })
      .expect(201)).body;
    expect(tenderEvidenceRevision.version).toBe(2);
    await technicalManager.get(`/api/v1/documents/${tenderEvidence.id}/content?version=2`).expect(200);
    await author.get(`/api/v1/documents/${tenderEvidence.id}/content?version=2`).expect(403);

    const foreignTender = (await admin.post('/api/v1/tendering/tenders').send({ title: 'J1 unrelated tender', value: 1 }).expect(201)).body;
    const foreignTenderEvidence = (await engineer.post(`/api/v1/tendering/tenders/${foreignTender.id}/study-files`)
      .field('category', 'drawing').field('title', 'Unrelated tender drawing')
      .attach('file', minimalPdf('unrelated tender'), { filename: 'unrelated-tender.pdf', contentType: 'application/pdf' })
      .expect(201)).body.document;
    const tenderStudyBase = `/api/v1/tendering/tenders/${tender.id}`;
    const prematureTenderQuotation = await admin.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({ vatRate: 5 });
    expect(prematureTenderQuotation.status).toBe(400);
    expect(String(prematureTenderQuotation.body.message)).toMatch(/approved technical study/i);
    const tenderStudyPayload = {
      title: 'J1 structured MEP tender study', inputRevision: 'Tender addendum Rev 03', reviewerId: 'j1-technical-manager',
      scopeSummary: 'Study the fictional MEP tender requirements before quantity take-off and pricing.',
      systems: [{ discipline: 'MEP', name: 'HVAC', designBasis: 'Client specification Rev 03', interfaces: ['BMS', 'Electrical Power'] }],
      requirements: [{ category: 'client', statement: 'Provide compliant HVAC controls', acceptanceCriteria: 'Compliant technical schedule', sourceRef: 'Specification clause 7', compliance: 'compliant', response: 'Included' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: ['Normal working hours'], exclusions: [],
      evidence: [{ documentId: tenderEvidence.id, title: 'caller-spoofed title', kind: 'drawing', revision: '999' }],
    };
    const tenderReviewers = (await engineer.get(`${tenderStudyBase}/study-reviewers`).expect(200)).body;
    expect(tenderReviewers.some((row: { userId: string }) => row.userId === 'j1-technical-manager')).toBe(true);
    expect(tenderReviewers.some((row: { userId: string }) => row.userId === 'j1-engineer')).toBe(false);
    await sales.post(`${tenderStudyBase}/studies`).send(tenderStudyPayload).expect(403);
    const foreignTenderEvidenceAttempt = await engineer.post(`${tenderStudyBase}/studies`).send({
      ...tenderStudyPayload,
      evidence: [{ documentId: foreignTenderEvidence.id, title: 'spoof', kind: 'drawing', revision: '1' }],
    });
    expect(foreignTenderEvidenceAttempt.status).toBe(400);
    expect(String(foreignTenderEvidenceAttempt.body.message)).toMatch(/must belong to this tender/i);
    const tenderStudy = (await engineer.post(`${tenderStudyBase}/studies`).send(tenderStudyPayload).expect(201)).body;
    expect(tenderStudy).toMatchObject({ status: 'draft', authorId: 'j1-engineer', reviewerId: 'j1-technical-manager' });
    expect(tenderStudy.evidence).toEqual([{ documentId: tenderEvidence.id, title: 'Tender MEP specification · Rev 02', kind: 'client_specification', revision: '2' }]);
    await engineer.post(`${tenderStudyBase}/studies/${tenderStudy.id}/submit`).expect(201);
    await engineer.post(`${tenderStudyBase}/studies/${tenderStudy.id}/approve`).send({ comment: 'self approval attempt' }).expect(403);
    await sales.post(`${tenderStudyBase}/studies/${tenderStudy.id}/approve`).send({ comment: 'wrong functional permission' }).expect(403);
    const approvedTenderStudy = (await technicalManager.post(`${tenderStudyBase}/studies/${tenderStudy.id}/approve`)
      .send({ comment: 'Tender technical basis approved for quantity take-off' }).expect(201)).body;
    expect(approvedTenderStudy.status).toBe('approved');

    const pricingBeforeTakeoff = await admin.get(`${tenderStudyBase}/pricing`);
    expect(pricingBeforeTakeoff.status).toBe(409);
    expect(String(pricingBeforeTakeoff.body.message)).toMatch(/approved quantity take-off/i);
    const quotationBeforeTakeoff = await admin.post(`${tenderStudyBase}/quotation`).send({ vatRate: 5 });
    expect(quotationBeforeTakeoff.status).toBe(409);
    expect(String(quotationBeforeTakeoff.body.message)).toMatch(/approved quantity take-off/i);

    const initialTakeoffView = (await engineer.get(`${tenderStudyBase}/quantity-takeoff`).expect(200)).body;
    expect(initialTakeoffView).toMatchObject({ approvedStudy: { id: tenderStudy.id }, revisions: [] });
    await sales.post(`${tenderStudyBase}/quantity-takeoff`).send({ lines: [{ description: 'Spoofed line', unit: 'no', quantity: 1 }] }).expect(403);
    const takeoffDraft = (await engineer.post(`${tenderStudyBase}/quantity-takeoff`).send({ lines: [{
      description: 'Fictional MEP control point', unit: 'no', quantity: null,
      sourceStudyItemId: approvedTenderStudy.requirements[0].id,
    }] }).expect(201)).body;
    expect(takeoffDraft).toMatchObject({ status: 'draft', sourceId: tenderStudy.id, sourceRevRef: expect.stringContaining('Tender addendum Rev 03') });
    await technicalManager.patch(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/lines`).send({ lines: takeoffDraft.lines }).expect(403);
    await technicalManager.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/approve`).expect(400);
    const savedTakeoff = (await estimator.patch(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/lines`).send({
      lines: takeoffDraft.lines.map((line: { lineId: string; description: string; unit: string }) => ({ ...line, quantity: 10 })),
    }).expect(200)).body;
    await engineer.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/approve`).expect(403);
    await estimator.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/approve`).expect(403);
    const approvedTakeoff = (await technicalManager.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/approve`).expect(201)).body;
    expect(approvedTakeoff).toMatchObject({ status: 'approved', approvedBy: 'j1-technical-manager' });
    await technicalManager.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/project-to-boq`).expect(403);
    await engineer.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/project-to-boq`).expect(403);
    await estimator.post(`/api/v1/tendering/tenders/${foreignTender.id}/quantity-takeoff/${takeoffDraft.id}/project-to-boq`).expect(404);
    const projected = (await estimator.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/project-to-boq`).expect(201)).body;
    expect(projected).toMatchObject({ boq: { sourceBasisRevisionId: takeoffDraft.id }, items: [{ sourceBasisLineId: savedTakeoff.lines[0].lineId, quantity: 10 }] });
    const repeatedProjection = (await estimator.post(`${tenderStudyBase}/quantity-takeoff/${takeoffDraft.id}/project-to-boq`).expect(201)).body;
    expect(repeatedProjection.replaced).toBe(0);
    const { boq, items: projectedItems } = (await estimator.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    expect(boq).toMatchObject({ sourceBasisRevisionId: takeoffDraft.id, sourceRevisionRef: expect.stringContaining('Tender addendum Rev 03') });
    const item = projectedItems[0];
    await estimator.put(`${tenderStudyBase}/boq/items/${item.id}`).send({ quantity: 99 }).expect(409);
    await admin.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'estimating' }).expect(200);
    const tenderBuildUp = (await estimator.post('/api/v1/tendering/estimates').send({ boqItemId: item.id, components: [{ costType: 'material', description: 'Fictional component', quantity: 1, unitCost: 200 }], applyToBoq: true }).expect(201)).body;
    const tenderWorkbookResponse = await estimator.get(`/api/v1/tendering/tenders/${tender.id}/pricing.xlsx`)
      .buffer(true).parse(binaryParser).expect(200);
    expect(tenderWorkbookResponse.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const tenderWorkbook = XLSX.read(tenderWorkbookResponse.body as Buffer, { type: 'buffer' });
    expect(tenderWorkbook.SheetNames).toEqual(['Summary', 'Cost Breakdown', 'Supplier Sources']);
    const tenderSummary = XLSX.utils.sheet_to_json<Array<string | number>>(tenderWorkbook.Sheets.Summary, { header: 1 });
    expect(tenderSummary).toContainEqual(['Company', 'J1 Audit MEP L.L.C.']);
    expect(tenderSummary).toContainEqual(['Technical Study ID', tenderStudy.id]);
    expect(tenderSummary).toContainEqual(['Technical Study revision', 1]);
    expect(tenderSummary).toContainEqual(['Client input revision', 'Tender addendum Rev 03']);
    expect(tenderSummary).toContainEqual(['Approved Quantity Take-Off ID', takeoffDraft.id]);
    expect(tenderSummary).toContainEqual(['Quantity source revision', expect.stringContaining('Tender addendum Rev 03')]);
    expect(tenderSummary).toContainEqual(['Total direct cost', 2000]);
    expect(tenderSummary).toContainEqual(['Total selling value', 2000]);
    const tenderCostRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(tenderWorkbook.Sheets['Cost Breakdown']);
    expect(tenderCostRows).toEqual([expect.objectContaining({
      'BOQ item ID': item.id,
      'Build-up ID': tenderBuildUp.id,
      'Technical Study ID': tenderStudy.id,
      'Item code': '1',
      Quantity: 10,
      'Direct cost': 2000,
      'Selling rate / unit': 200,
      'Line total': 2000,
    })]);
    await commercialManager.get(`/api/v1/tendering/tenders/${tender.id}/pricing.xlsx`).buffer(true).parse(binaryParser).expect(200);
    await sales.get(`/api/v1/tendering/tenders/${tender.id}/pricing.xlsx`).expect(403);
    await sales.get(`/api/v1/tendering/tenders/${tender.id}/pricing`).expect(403);
    await sales.get(`/api/v1/tendering/tenders/${tender.id}/pricing/export.csv`).expect(403);
    await technicalManager.get(`/api/v1/tendering/tenders/${tender.id}/pricing.xlsx`).expect(403);
    await foreignAdmin.get(`/api/v1/tendering/tenders/${tender.id}/pricing.xlsx`).expect(404);
    const tenderWorkbookOutputDir = join(process.cwd(), '..', '..', 'outputs', 'full-aura-audit');
    await mkdir(tenderWorkbookOutputDir, { recursive: true });
    await writeFile(join(tenderWorkbookOutputDir, 'wave2-tender-pricing-proof.xlsx'), tenderWorkbookResponse.body as Buffer);
    await admin.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'priced' }).expect(200);
    const prematureTenderSubmission = await admin.post(`/api/v1/tendering/tenders/${tender.id}/submit`).send({ method: 'other' });
    expect(prematureTenderSubmission.status).toBe(409);
    expect(String(prematureTenderSubmission.body.message)).toMatch(/internally approved commercial offer/i);
    const tenderQuote = (await estimator.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({ vatRate: 5 }).expect(201)).body;
    await estimator.patch(`/api/v1/crm/quotations/${tenderQuote.id}/status`).send({ action: 'submit_review' }).expect(200);
    await attachEvidence(tenderQuote.id, true);
    await commercialManager.patch(`/api/v1/crm/quotations/${tenderQuote.id}/status`).send({ action: 'approve' }).expect(200);
    const proposalSource = (await commercialManager.get(`/api/v1/tendering/tenders/${tender.id}/technical-proposal`).expect(200)).body;
    expect(proposalSource).toMatchObject({
      tender: { id: tender.id, title: 'J1 fictional MEP tender' },
      study: {
        id: tenderStudy.id,
        revisionNo: 1,
        scopeSummary: tenderStudyPayload.scopeSummary,
        evidence: [{ documentId: tenderEvidence.id, revision: '2' }],
      },
      commercialReference: { quotationId: tenderQuote.id, quoteNumber: tenderQuote.quoteNumber, revision: 0 },
    });
    expect(JSON.stringify(proposalSource)).not.toMatch(/unitPrice|sellingRate|totalCost|marginPercent/);
    await engineer.get(`/api/v1/tendering/tenders/${tender.id}/technical-proposal`).expect(403);
    await foreignAdmin.get(`/api/v1/tendering/tenders/${tender.id}/technical-proposal`).expect(404);
    const submission = await admin.post(`/api/v1/tendering/tenders/${tender.id}/submit`).send({ method: 'other', reference: 'J1-INTERNAL-SIMULATION', notes: 'Isolated local state only; no customer transmission.' });
    expect(submission.status).toBe(201);
    console.log('J1_TENDER_OBSERVATION', JSON.stringify({ authOn: true, tenderStudyAuthor: tenderStudy.authorId, tenderStudyReviewer: approvedTenderStudy.reviewedBy, technicalStudyCreated: true, technicalStudyApproved: approvedTenderStudy.status === 'approved', pricingBeforeTakeoffHttp: pricingBeforeTakeoff.status, quotationBeforeTakeoffHttp: quotationBeforeTakeoff.status, quantityTakeoffAuthor: 'j1-engineer', quantityTakeoffEditor: 'j1-estimator', quantityTakeoffApprover: approvedTakeoff.approvedBy, takeoffSourceStudyId: takeoffDraft.sourceId, boqSourceBasisRevisionId: boq.sourceBasisRevisionId, manualProjectedQuantityChangeHttp: 409, wrongTenderProjectionHttp: 404, canonicalEvidenceIdPreserved: tenderStudy.evidence[0].documentId === tenderEvidence.id, canonicalEvidenceRevisionPreserved: tenderStudy.evidence[0].revision === '2', foreignEvidenceRejected: foreignTenderEvidenceAttempt.status === 400, wrongFunctionalPermissionDenied: true, pricingWorkbookHttp: 200, pricingWorkbookStudyId: tenderStudy.id, pricingWorkbookRoleAllowed: ['r-estimator', 'r-commercial-manager'], pricingWorkbookSalesHttp: 403, pricingPayloadSalesHttp: 403, pricingCsvSalesHttp: 403, pricingWorkbookTechnicalManagerHttp: 403, pricingWorkbookForeignTenantHttp: 404, prematureQuotationHttp: prematureTenderQuotation.status, prematureSubmissionHttp: prematureTenderSubmission.status, tenderEstimatorPreparedOffer: true, tenderCommercialManagerApprovedOffer: true, technicalProposalSourceHttp: 200, technicalProposalWrongRoleHttp: 403, technicalProposalForeignTenantHttp: 404, technicalProposalContainsInternalCommercials: false, submissionHttp: submission.status, submittedStatus: submission.body.tender?.status }));
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
    if (previousStorage === undefined) delete process.env.DMS_STORAGE_DIR; else process.env.DMS_STORAGE_DIR = previousStorage;
    await rm(storageDir, { recursive: true, force: true });
  }
});
