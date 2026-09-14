import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

// Audit characterization, not employee-role acceptance. Every mutation belongs
// to one isolated in-memory job. No live system, client or bank is contacted.
it('traces one awarded job through delivery evidence and handover with Auth ON', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-delivery-audit-secret';
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService), tenant = app.get(TenantContext), access = app.get(AccessService);
  const tenantId = 'j2-j6-audit-only';
  for (const userId of ['delivery-maker', 'delivery-checker']) {
    access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: tenantId }, approvalLimit: 1000000 });
  }
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    const http = request.agent(app.getHttpServer()).set('Authorization', `Bearer ${auth.mint({ sub: 'delivery-maker', tenantId })}`);
    const checker = request.agent(app.getHttpServer()).set('Authorization', `Bearer ${auth.mint({ sub: 'delivery-checker', tenantId })}`);
    const post = async (path: string, body: unknown = {}) => (await http.post(`/api/v1${path}`).send(body).expect(201)).body;
    const get = async (path: string) => (await http.get(`/api/v1${path}`).expect(200)).body;
    const put = async (path: string, body: unknown = {}) => (await http.put(`/api/v1${path}`).send(body).expect(200)).body;
    const patch = async (path: string, body: unknown) => (await http.patch(`/api/v1${path}`).send(body).expect(200)).body;
    const eventually = async (read: () => Promise<any>, ready: (value: any) => boolean) => {
      for (let i = 0; i < 30; i++) {
        const value = await read();
        if (ready(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const value = await read(); expect(ready(value)).toBe(true); return value;
    };

    // J2: approved offer and award are distinct facts. The frozen commercial
    // handover supplies this project's execution identity and sold quantity.
    const account = await post('/crm/accounts', { name: 'Fictional delivery client' });
    const opportunity = await post('/crm/opportunities', { title: 'Audit CCTV job', value: 1000, accountId: account.id, accountName: account.name, executionType: 'tender' });
    const tender = await post('/tendering/tenders', { title: 'Audit CCTV tender', value: 1000, accountId: account.id, accountName: account.name, status: 'submitted', sourceOpportunityId: opportunity.id });
    const { boq } = await get(`/tendering/tenders/${tender.id}/boq`);
    const item = await post(`/tendering/tenders/${tender.id}/boq/items`, { boqId: boq.id, itemCode: 'CAM-01', description: 'CCTV cameras', unit: 'no', quantity: 10, rate: 100 });
    const quote = await post(`/tendering/tenders/${tender.id}/quotation`);
    await post('/document-requirements/seed', { entityType: 'crm.quotation', entityId: quote.id });
    const checklist = await get(`/document-requirements?entityType=crm.quotation&entityId=${quote.id}`);
    for (const row of checklist.requirements) for (let i = 0; i < row.requiredCount; i++) {
      let reference = `fictional-vendor-${i}`, type = 'EXTERNAL_REFERENCE';
      if (row.type !== 'VENDOR_QUOTE') {
        const doc = await post('/documents', { title: `Audit ${row.type}`, kind: row.type, aggregateType: 'crm.quotation', aggregateId: quote.id, content: 'Fictional audit evidence only.' });
        reference = doc.document?.id ?? doc.id; type = 'DOCUMENT_ID';
      }
      await post(`/document-requirements/${row.id}/evidence`, { type, reference });
    }
    await patch(`/crm/quotations/${quote.id}/status`, { action: 'submit_review' });
    await checker.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);
    await post(`/tendering/tenders/${tender.id}/award`, { awardedValue: 1000, currency: 'AED', awardedAt: '2026-09-14T00:00:00.000Z', awardReference: 'FICTIONAL-AUDIT-LOA' });
    const [contract] = await eventually(() => get(`/contracts/contracts?tenderId=${tender.id}`), rows => rows.length === 1);
    await patch(`/contracts/contracts/${contract.id}/status`, { status: 'active' });
    const [project] = await eventually(() => get(`/projects/projects?contractId=${contract.id}`), rows => rows.length === 1);
    const projectId = project.id;
    const frozen = project.handoverSnapshot.sourceItems[0];
    expect(frozen.soldQuantity).toBe(10);
    const wbs = await post('/projects/wbs', { projectId, code: '1.1', title: 'Install CCTV', plannedValue: 800, boqItemId: item.id });
    const mapping = await post('/projects/delivery-item-maps', { projectId, handoverId: project.handoverId, frozenItemKey: frozen.frozenItemKey, sourceKind: frozen.sourceKind, sourceId: frozen.sourceId, sourceRevisionRef: frozen.sourceRevisionRef, sourceItemId: frozen.sourceItemId, wbsNodeId: wbs.id });
    expect(mapping.projectId).toBe(projectId);
    console.log('J2_HANDOVER', JSON.stringify({ authOn: true, fixtureAdministrators: true, tenderId: tender.id, contractId: contract.id, projectId, frozenQuantity: frozen.soldQuantity, mapped: true }));

    // J3/J4: release, install and report use this same project. P2P and stock
    // movement defects are reproduced separately, not hidden by this continuation.
    const drawing = await post('/engineering/drawings', { projectId, code: 'AUD-DWG', title: 'CCTV layout', revision: '0', discipline: 'cctv' });
    await post(`/engineering/drawings/${drawing.id}/submit`);
    await post(`/engineering/drawings/${drawing.id}/start-review`);
    await post(`/engineering/drawings/${drawing.id}/review`, { outcome: 'approved', comments: 'Fixture construction release' });
    await post('/site/installations', { projectId, boqItemId: item.id, date: '2026-09-14', description: 'Installed CCTV cameras', quantity: 10, unit: 'no' });
    const report = await post('/site/daily-reports', { projectId, date: '2026-09-14', workDescription: 'CCTV installation' });
    await put(`/site/daily-reports/${report.id}/submit`);
    await post(`/site/daily-reports/${report.id}/start-review`);
    await post(`/site/daily-reports/${report.id}/approve`);

    // J5: certified, billed and paid remain separate. This audits the handoff
    // into AR; it does not simulate bank settlement or PostgreSQL persistence.
    const certificate = await post('/contracts/certificates', { contractId: contract.id, cumulativeWorkDone: 1000, reference: 'AUD-IPC-1' });
    await post(`/contracts/certificates/${certificate.id}/lines`, { projectId, boqItemId: item.id, description: 'CCTV cameras', quantity: 10, unit: 'no', rate: 100 });
    await checker.patch(`/api/v1/contracts/certificates/${certificate.id}/status`).send({ status: 'certified' }).expect(200);
    const invoices = await eventually(() => get('/finance/customer-invoices'), rows => rows.some((r: any) => r.contractRef === contract.id));
    const invoice = invoices.find((r: any) => r.contractRef === contract.id);
    const position = await get(`/projects/quantity-ledger/position/${item.id}`);
    console.log('J5_CERTIFICATION', JSON.stringify({ certified: position.certified, installed: position.installed, invoiceStatus: invoice.status, invoiceProjectId: invoice.projectId ?? null, invoiceLines: invoice.lines, cashSettlementTested: false }));
    await post(`/finance/customer-invoices/${invoice.id}/issue`);
    const receipt = await post(`/finance/customer-invoices/${invoice.id}/receipts`, { amount: invoice.total });
    const afterBilling = await get(`/projects/quantity-ledger/position/${item.id}`);
    expect(receipt.status).toBe('paid');
    // Known audit gaps: public mapping does not post Sold; the auto-drafted
    // aggregate invoice has no frozen line identity for the Billed subscriber.
    expect(afterBilling.sold).toBeNull();
    expect(afterBilling.billed).toBeNull();
    console.log('J5_BILLING_RECEIPT', JSON.stringify({ localReceiptStatus: receipt.status, amountReceived: receipt.amountPaid, quantityPosition: afterBilling, bankSettlementTested: false }));

    // J6: real domain evidence replaces obsolete manually ticked checklists.
    const device = await post('/elv/devices', { projectId, tag: 'AUD-CAM-01', system: 'cctv' });
    await put(`/elv/devices/${device.id}/status`, { status: 'installed' });
    const cx = '/commissioning/records', ho = '/commissioning/handovers';
    const system = await post(cx, { projectId, code: 'AUD-CX', title: 'CCTV commissioning', system: 'cctv' });
    const point = await post(`${cx}/${system.id}/test-items`, { pointNo: 'IMG-01', description: 'Image on VMS' });
    await post(`${cx}/${system.id}/test-items/${point.id}/runs`, { result: 'fail', remarks: 'Fictional cable fault' });
    await http.put(`/api/v1${cx}/${system.id}/commission`).send({ commissionedBy: 'Engineer', witnessedBy: 'Consultant' }).expect(409);
    const punch = await post(`${cx}/${system.id}/punch`, { description: 'Cable fault', severity: 'major' });
    await put(`${cx}/${system.id}/punch/${punch.id}/close`, { resolution: 'Re-terminated and verified' });
    await post(`${cx}/${system.id}/test-items/${point.id}/runs`, { result: 'pass', actual: 'Image visible' });
    await put(`${cx}/${system.id}/commission`, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
    for (const [number, docType, status] of [['AUD-CERT', 'certificate', 'approved'], ['AUD-ASBUILT', 'drawing', 'as_built'], ['AUD-PACK', 'document', 'approved']]) {
      await post('/doccontrol/register', { projectId, documentNumber: number, title: number, discipline: 'elv', docType, currentRevision: 'A', status });
    }
    await post(`${cx}/${system.id}/certificate-link`, { documentId: 'AUD-CERT' });
    await post(`${cx}/${system.id}/asbuilt-links`, { documentId: 'AUD-ASBUILT' });
    const pkg = await post(ho, { projectId, code: 'AUD-HO', title: 'CCTV client handover', projectName: 'Audit CCTV job' });
    await http.put(`/api/v1${ho}/${pkg.id}/checklist`).send({ omManuals: true }).expect(409);
    await http.put(`/api/v1${ho}/${pkg.id}/submit`).send({}).expect(409);
    await post(`${ho}/om-items/seed`, { commissioningId: system.id });
    for (const row of await get(`${ho}/om-items?projectId=${projectId}`)) {
      await put(`${ho}/om-items/${row.id}/state`, { to: 'submitted', documentId: 'AUD-PACK' });
      await put(`${ho}/om-items/${row.id}/state`, { to: 'reviewed' });
      await put(`${ho}/om-items/${row.id}/state`, { to: 'accepted' });
    }
    const training = await post(`${ho}/training`, { projectId, title: 'Client operator training' });
    await put(`${ho}/training/${training.id}/complete`, { attendees: 'Fictional client team' });
    await put(`${ho}/training/${training.id}/acknowledge`, { acknowledgedBy: 'Fictional client representative' });
    const spare = await post(`${ho}/spares`, { commissioningId: system.id, description: 'Spare camera', quantityRequired: 1 });
    await put(`${ho}/spares/${spare.id}/hand-over`, { quantity: 1 });
    await put(`${ho}/spares/${spare.id}/acknowledge`, { acknowledgedBy: 'Fictional client representative' });
    await put(`${ho}/${pkg.id}/submit`);
    const accepted = await put(`${ho}/${pkg.id}/accept`, { clientRepresentative: 'Fictional client representative', warrantyStartDate: '2026-09-14', warrantyMonths: 12 });
    expect(accepted.status).toBe('accepted');
    const dossier = await get(`${ho}/${pkg.id}/dossier`);
    const amcs = await eventually(() => get('/amc/contracts'), rows => rows.some((r: any) => r.contractNumber === `AMC-${pkg.id.slice(0, 8)}`));
    const amc = amcs.find((r: any) => r.contractNumber === `AMC-${pkg.id.slice(0, 8)}`);
    const closeout = await get(`/projects/projects/${projectId}/closeout-readiness`);
    console.log('J6_HANDOVER', JSON.stringify({ projectId, accepted: accepted.status, dossierIssues: dossier.issues?.length, transmittal: dossier.issues?.[0]?.transmittal ?? null, amcProjectId: amc.projectId ?? null, amcClientName: amc.clientName, amcScope: amc.serviceScope, closeout }));
    const closing = await post('/projects/closeouts', { projectId, notes: 'Isolated audit checklist acknowledgements, not real final-account evidence.' });
    await http.post(`/api/v1/projects/closeouts/${closing.id}/finalize`).send({ handoverDate: '2026-09-14' }).expect(409);
    for (let i = 0; i < closing.items.length; i++) await patch(`/projects/closeouts/${closing.id}/items/${i}`, { done: true });
    const finalized = await post(`/projects/closeouts/${closing.id}/finalize`, { handoverDate: '2026-09-14', dlpMonths: 12 });
    expect(finalized.status).toBe('completed');
    const projectAfter = await get(`/projects/projects/${projectId}`);
    console.log('J6_CLOSEOUT', JSON.stringify({ closeoutStatus: finalized.status, projectStatus: projectAfter.status, dlpEndDate: finalized.dlpEndDate, checklistAcknowledgementsOnly: true }));
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
  }
});
