// AURA OS — the governed tender basis, for the in-memory HTTP e2e suites.
//
// A tender is priced only on an independently approved technical study and an approved quantity
// take-off projected to its BOQ (`governedPricingContext`), and it is submitted only once its
// commercial offer is internally approved (`assertSubmissionReadiness`). Suites that walk a tender to
// submission or award build that basis here, through the product's own routes, signed by the named
// people who own each act — never by typing a BOQ line in. Same shape as the deal-chain fixture
// (apps/api/test/chains.e2e-spec.ts, 22dcd8a7).
import type { INestApplication } from '@nestjs/common';
import { AccessService, UsersService } from '@aura/core';
import type request from 'supertest';

type Http = ReturnType<typeof request>;

/** The people who sign each governed pre-submission act, with the shipped roles that own them. */
export const TENDER_TEAM = {
  presales: 'u-e2e-presales',
  techManager: 'u-e2e-techmgr',
  estimator: 'u-e2e-estimator',
  commercialManager: 'u-e2e-qs',
} as const;

/**
 * Grant the tender team their shipped roles in memory. The study's reviewer must be an ACTIVE
 * workspace user holding `tendering.study.approve` — the rule production applies — and every actor
 * named on a request is checked against its real grants.
 */
export function grantTenderTeam(app: INestApplication, tenantId: string): void {
  const access = app.get(AccessService);
  const users = app.get(UsersService);
  for (const [userId, roleId] of [
    [TENDER_TEAM.presales, 'r-pre-sales'],
    [TENDER_TEAM.techManager, 'r-technical-manager'],
    [TENDER_TEAM.estimator, 'r-estimator'],
    [TENDER_TEAM.commercialManager, 'r-commercial-manager'],
  ]) {
    access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: tenantId } });
    users.save({ tenantId, userId, displayName: userId, active: true });
  }
}

/** One BOQ item's resource sheet — the supply price is the material component's unit cost. */
export const tenderPricingSheet = (supplyUnitPrice: number) => ({
  resources: {
    supplyUnitPrice, technician: { count: 2, hours: 40, rate: 55 }, engineer: { count: 0, hours: 0, rate: 0 },
    projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, wastagePercent: 0, accessories: 0, subcontract: 0, equipmentRent: 0, otherDirect: 0,
  },
  indirectPercent: 4, overheadPercent: 8, riskPercent: 3, profitPercent: 15,
});

/** Re-price one BOQ item on the tender's pricing sheet, as the Estimator — the raw response, for refusals. */
export const repriceTenderItem = (http: Http, tenderId: string, itemId: string, supplyUnitPrice: number) =>
  http.post(`/api/v1/tendering/tenders/${tenderId}/pricing/items/${itemId}`).set('x-e2e-actor', TENDER_TEAM.estimator).send(tenderPricingSheet(supplyUnitPrice));

/** Price one BOQ item on the tender's pricing sheet, as the Estimator. Writes the selling rate back. */
export async function priceTenderItem(http: Http, tenderId: string, itemId: string, supplyUnitPrice: number): Promise<void> {
  await repriceTenderItem(http, tenderId, itemId, supplyUnitPrice).expect(201);
}

/**
 * The governed basis pricing stands on: Pre-Sales writes and submits the technical study, the
 * Technical Manager approves it independently; the take-off is approved and the Estimator projects it
 * to the BOQ, then prices the item.
 */
export async function governTenderBasis(
  http: Http,
  tenderId: string,
  line: { description: string; unit: string; quantity: number } = { description: 'IP camera', unit: 'no', quantity: 10 },
  supplyUnitPrice = 1_200,
): Promise<{ itemId: string }> {
  const base = `/api/v1/tendering/tenders/${tenderId}`;
  const study = (await http.post(`${base}/studies`).set('x-e2e-actor', TENDER_TEAM.presales).send({
    title: `${line.description} technical study`, inputRevision: 'Client specification Rev 01', reviewerId: TENDER_TEAM.techManager,
    scopeSummary: `Supply, install, test and commission: ${line.description}.`,
    systems: [{ discipline: 'ELV', name: line.description, designBasis: 'As specified', interfaces: ['LAN'] }],
    requirements: [{ category: 'client', statement: `${line.quantity} ${line.unit} ${line.description}`, acceptanceCriteria: 'Installed and tested', compliance: 'compliant', response: 'Included' }],
    surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
  }).expect(201)).body as { id: string };
  await http.post(`${base}/studies/${study.id}/submit`).set('x-e2e-actor', TENDER_TEAM.presales).expect(201);
  await http.post(`${base}/studies/${study.id}/approve`).set('x-e2e-actor', TENDER_TEAM.techManager).send({ comment: 'Approved for estimation' }).expect(201);
  const takeoff = (await http.post(`${base}/quantity-takeoff`).set('x-e2e-actor', TENDER_TEAM.presales)
    .send({ lines: [line] }).expect(201)).body as { id: string };
  await http.post(`${base}/quantity-takeoff/${takeoff.id}/approve`).set('x-e2e-actor', TENDER_TEAM.techManager).send({}).expect(201);
  const projection = (await http.post(`${base}/quantity-takeoff/${takeoff.id}/project-to-boq`).set('x-e2e-actor', TENDER_TEAM.estimator).expect(201)).body;
  const [item] = projection.items as Array<{ id: string }>;
  await priceTenderItem(http, tenderId, item.id, supplyUnitPrice);
  return { itemId: item.id };
}

/** Generate the tender's offer from the priced BOQ, as the Estimator — a draft (EST-16: its Rev 0). */
export async function generateTenderOffer(http: Http, tenderId: string): Promise<{ id: string; quoteNumber: string; status: string }> {
  return (await http.post(`/api/v1/tendering/tenders/${tenderId}/quotation`).set('x-e2e-actor', TENDER_TEAM.estimator).send({}).expect(201)).body;
}

/**
 * Satisfy the offer's evidence checklist so it may be approved.
 *
 * VENDOR_QUOTE on an offer raised from a tender is COMPUTED from the tender's governed supplier
 * quotations and cannot be typed in (409). These tenders are never put to suppliers — the supplier
 * path is proved in apps/web/e2e/tender-real-supply-path.spec.ts — so it takes the governed
 * exception: a reasoned waiver by the Commercial Manager, who is not the offer's preparer.
 */
export async function satisfyOfferChecklist(http: Http, quotationId: string): Promise<void> {
  const checklist = (await http.get(`/api/v1/document-requirements?entityType=crm.quotation&entityId=${quotationId}`).expect(200)).body as {
    requirements: Array<{ id: string; type: string; requiredCount: number }>;
  };
  for (const requirement of checklist.requirements) {
    if (requirement.type === 'VENDOR_QUOTE') {
      await http.post(`/api/v1/document-requirements/${requirement.id}/waive`).set('x-e2e-actor', TENDER_TEAM.commercialManager)
        .send({ reason: 'e2e fixture: this tender was not put to suppliers; the supplier path is proved elsewhere' })
        .expect(201);
      continue;
    }
    for (let i = 0; i < requirement.requiredCount; i++) {
      await http.post(`/api/v1/document-requirements/${requirement.id}/evidence`)
        .send({ type: 'DOCUMENT_ID', reference: `${requirement.type}-${quotationId.slice(0, 8)}-${i + 1}` })
        .expect(201);
    }
  }
}

/**
 * Generate the tender's offer, satisfy its checklist, submit it for review and approve it — which
 * locks the Commercial Baseline the submission and award read.
 */
export async function approveTenderOffer(http: Http, tenderId: string): Promise<{ quotationId: string; baselineId: string; baselineTotal: number }> {
  const offer = await generateTenderOffer(http, tenderId);
  await satisfyOfferChecklist(http, offer.id);
  await http.patch(`/api/v1/crm/quotations/${offer.id}/status`).send({ action: 'submit_review' }).expect(200);
  await http.patch(`/api/v1/crm/quotations/${offer.id}/status`).send({ action: 'approve' }).expect(200);
  const baseline = (await http.get(`/api/v1/crm/quotations/${offer.id}/baseline`).expect(200)).body as { id: string; total: number };
  return { quotationId: offer.id, baselineId: baseline.id, baselineTotal: baseline.total };
}
