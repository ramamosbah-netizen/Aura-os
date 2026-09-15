// The governed commercial prerequisite a physical quantity needs before it can exist: a tender that
// was priced, quoted, approved and awarded, the contract it produced, and the project that contract
// created with its frozen award items intact. Nothing downstream — a quantity, a work package's
// progress, an activity's progress — may be proven against a project conjured without it, because
// the frozen item is what makes "installed against WHAT" answerable.
//
// Extracted from quantity-ledger.e2e-spec.ts when a second spec needed the same ground truth. One
// fixture, so the two specs cannot drift into proving things about differently-shaped projects.
import type request from 'supertest';
import type { QuantityLedgerService } from '@aura/projects';
import { establishGovernedQuotationReadiness } from './governed-quotation-readiness';

/** Poll until the fetcher returns a truthy value (reactor handlers are async). */
export async function until<T>(fetcher: () => Promise<T | null>, tries = 25): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = await fetcher();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetcher();
}

/** The award evidence a physical quantity is measured against — frozen at handover, never re-derived. */
export interface FrozenSoldItem {
  frozenItemKey: string;
  sourceItemId: string;
  soldQuantity: number;
  unit: string;
}

export interface GovernedDeliveryFixture {
  project: { id: string; name?: string | null; handoverSnapshot?: { sourceItems?: FrozenSoldItem[] } };
  contract: { id: string };
  item: FrozenSoldItem;
  /** What an installation is posted against. */
  boqItemId: string;
  wbs: { id: string; progress: number; earnedValue: number };
}

/** Build the governed commercial prerequisite required by C2 before an installation can be posted. */
export async function createGovernedDeliveryFixture(
  http: ReturnType<typeof request>,
  quantityLedger: QuantityLedgerService,
  title: string,
  quantity: number,
  unit: string,
  /** The tenant the calling spec runs under — the ledger position is read inside it, not globally. */
  tenantId: string,
): Promise<GovernedDeliveryFixture> {
  const account = (await http.post('/api/v1/crm/accounts').send({ name: `${title} Account` }).expect(201)).body;
  const opportunity = (await http.post('/api/v1/crm/opportunities').send({
    title,
    value: 600_000,
    accountId: account.id,
    accountName: account.name,
    executionType: 'tender',
  }).expect(201)).body;
  const tender = (await http.post('/api/v1/tendering/tenders').send({
    title: `${title} Tender`,
    value: 600_000,
    accountId: account.id,
    accountName: account.name,
    status: 'submitted',
    sourceOpportunityId: opportunity.id,
  }).expect(201)).body;
  await http.post('/api/v1/tendering/bid-scores').send({
    tenderId: tender.id,
    criteria: [{ name: 'Strategic fit', weight: 1, score: 8 }],
    notes: 'Governed quantity-ledger fixture',
  }).expect(201);
  const studyResponse = await http.post(`/api/v1/tendering/tenders/${tender.id}/studies`).send({
    title: `${title} technical study`,
    inputRevision: 'Client specification Rev 01',
    reviewerId: 'qty-checker',
    scopeSummary: title,
    systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'Approved test basis', interfaces: [] }],
    requirements: [{ category: 'client', statement: `${quantity} ${unit} required`, acceptanceCriteria: 'Install and test', compliance: 'compliant', response: 'Included' }],
    surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
  });
  if (studyResponse.status !== 201) throw new Error(`technical study setup failed: ${studyResponse.status} ${JSON.stringify(studyResponse.body)}`);
  const study = studyResponse.body;
  await http.post(`/api/v1/tendering/tenders/${tender.id}/studies/${study.id}/submit`).send({}).expect(201);
  await http.post(`/api/v1/tendering/tenders/${tender.id}/studies/${study.id}/approve`).set('x-e2e-actor', 'qty-checker').send({ comment: 'Approved for estimation' }).expect(201);
  await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'estimating' }).expect(200);
  const takeoff = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff`).send({
    lines: [{ description: title, unit, quantity }],
  }).expect(201)).body;
  await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/approve`).set('x-e2e-actor', 'qty-checker').send({}).expect(201);
  const projection = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/project-to-boq`).send({}).expect(201)).body;
  const projectedItem = projection.items[0];
  await http.post('/api/v1/tendering/estimates').send({
    boqItemId: projectedItem.id,
    components: [{ costType: 'material', description: title, quantity: 1, unitCost: 100 }],
    applyToBoq: false,
  }).expect(201);
  await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'priced' }).expect(200);
  const quotation = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({}).expect(201)).body;
  await establishGovernedQuotationReadiness(http, quotation.id, `quantity-ledger-${title}`);
  await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).send({ action: 'submit_review' }).expect(200);
  await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).set('x-e2e-actor', 'qty-checker').send({ action: 'approve' }).expect(200);
  const awardResponse = await http.post(`/api/v1/tendering/tenders/${tender.id}/award`).set('x-e2e-actor', 'qty-checker').send({
    awardedValue: 600_000,
    currency: 'AED',
    awardedAt: '2026-08-25T07:30:00.000Z',
    awardReference: `LOA-${title}`,
  });
  if (awardResponse.status !== 201) throw new Error(`governed tender award failed: ${awardResponse.status} ${JSON.stringify(awardResponse.body)}`);
  const contract = await until(async () => {
    const contracts = (await http.get(`/api/v1/contracts/contracts?tenderId=${tender.id}`).expect(200)).body as Array<{ id: string }>;
    return contracts[0] ?? null;
  });
  if (!contract) throw new Error('governed tender did not produce a contract');
  await http.patch(`/api/v1/contracts/contracts/${contract.id}/status`).send({ status: 'active' }).expect(200);
  const project = await until(async () => {
    const projects = (await http.get(`/api/v1/projects/projects?contractId=${contract.id}`).expect(200)).body as GovernedDeliveryFixture['project'][];
    return projects[0] ?? null;
  });
  if (!project) throw new Error('signed governed contract did not produce a project');
  const item = (project.handoverSnapshot?.sourceItems ?? [])[0];
  if (!item?.frozenItemKey || item.unit !== unit || item.sourceItemId === null || item.soldQuantity !== quantity) {
    throw new Error('governed handover did not preserve authoritative Tender item evidence');
  }
  const wbs = (await http.post('/api/v1/projects/wbs').send({
    projectId: project.id,
    code: `1.${title.slice(0, 8)}`,
    title: `${title} delivery`,
    plannedValue: 100_000,
    boqItemId: item.sourceItemId,
  }).expect(201)).body;
  await http.post('/api/v1/projects/delivery-item-maps').send({
    projectId: project.id,
    frozenItemKey: item.frozenItemKey,
    wbsNodeId: wbs.id,
  }).expect(201);
  await until(async () => (await quantityLedger.position(tenantId, item.sourceItemId)).sold === quantity ? true : null);
  return { project, contract, item, boqItemId: item.sourceItemId, wbs };
}
