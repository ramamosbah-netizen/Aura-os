import { expect, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * The governed commercial ground a MEASURED quantity needs before it can exist, over the public API.
 *
 * Nothing about physical progress can be proven against a project conjured with a bare
 * `POST /projects/projects`: a quantity is installed against a FROZEN sold item, and without an
 * award there is no frozen item for it to be installed against. So this walks the real path —
 *
 *   opportunity → tender → scored → technical study approved → take-off approved → BOQ →
 *   estimate → priced → quotation → readiness evidence → approved → AWARD →
 *   contract → active → project (with its handover snapshot) → WBS node → delivery item map
 *
 * — because every gate along it is one the product actually enforces, and a fixture that skipped
 * them would prove the Gantt works on a project shape that cannot occur.
 *
 * The API-side twin of this lives at apps/api/test/helpers/governed-delivery-fixture.ts. Two
 * implementations because the two suites hold different clients (Supertest vs Playwright), not
 * because they assert different things: keep them saying the same thing about the same chain.
 *
 * SEGREGATION OF DUTIES IS REAL HERE. The study and take-off approvals, the quotation approval
 * and the award all refuse self-authorisation, and they are not one person's authority either —
 * so this signs in a Technical Manager and a Commercial Manager and uses each for what that role
 * actually governs, exactly as the Wave 2 offer proof does.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

export interface GovernedDelivery {
  projectId: string;
  /** The frozen sold item's id — what an installation is posted against. */
  boqItemId: string;
  /** The work package the sold item is mapped to. Progress on it is MEASURED. */
  wbsNodeId: string;
  soldQuantity: number;
  unit: string;
  /** Remove the two approver identities this fixture signed in. Safe to call more than once. */
  cleanup: () => Promise<void>;
}

const APPROVER_PASSWORD = 'Aura-Governed-Delivery-2026!';

/** Create an identity holding exactly one shipped role, and sign it in. */
async function approver(
  request: APIRequestContext,
  suffix: string,
  displayName: string,
  roleId: string,
): Promise<{ id: string; headers: Record<string, string> }> {
  const id = `governed-${suffix}-${Date.now()}`;
  const created = await request.post('/api/admin/users', { data: { userId: id, displayName, email: `${id}@example.invalid` } });
  expect(created.ok(), `create ${id} → ${await created.text()}`).toBe(true);
  const credential = await request.post(`/api/admin/users/${encodeURIComponent(id)}/password`, { data: { password: APPROVER_PASSWORD, mustChange: false } });
  expect(credential.ok(), await credential.text()).toBe(true);
  const granted = await request.post('/api/admin/access/grants', { data: { userId: id, roleId } });
  expect(granted.ok(), await granted.text()).toBe(true);
  const login = await request.post(`${API}/auth/login`, { data: { username: id, password: APPROVER_PASSWORD } });
  expect(login.ok(), await login.text()).toBe(true);
  return { id, headers: { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` } };
}

/** The whole chain is guarded; without a verifier there is no identity to approve as. */
export const canBuildGovernedDelivery = (): boolean => Boolean(apiAuthHeaders().Authorization);

export async function createGovernedDelivery(
  request: APIRequestContext,
  options: { title: string; quantity: number; unit: string; plannedValue?: number },
): Promise<GovernedDelivery> {
  const { title, quantity, unit } = options;
  // Two authorities, because they are two authorities: the Technical Manager independently
  // approves what was designed and measured; the Sales Manager approves the offer and signs the
  // award (`tendering.*` — the Commercial Manager governs contracts and reads tendering, but does
  // not award). The session user authors everything and approves none of it.
  const technical = await approver(request, 'technical', 'Governed fixture Technical Manager', 'r-technical-manager');
  const commercial = await approver(request, 'commercial', 'Governed fixture Sales Manager', 'r-sales-manager');
  const cleanup = async () => {
    await Promise.allSettled([technical, commercial].map((actor) =>
      request.delete(`/api/admin/users/${encodeURIComponent(actor.id)}`, { timeout: 15_000 })));
  };

  const post = async <T>(path: string, data: unknown, headers = apiAuthHeaders()): Promise<T> => {
    const response = await request.post(`${API}${path}`, { headers: { 'content-type': 'application/json', ...headers }, data });
    expect(response.ok(), `POST ${path} → ${response.status()} ${await response.text()}`).toBe(true);
    return response.json() as Promise<T>;
  };
  const patch = async <T>(path: string, data: unknown, headers = apiAuthHeaders()): Promise<T> => {
    const response = await request.patch(`${API}${path}`, { headers: { 'content-type': 'application/json', ...headers }, data });
    expect(response.ok(), `PATCH ${path} → ${response.status()} ${await response.text()}`).toBe(true);
    return response.json() as Promise<T>;
  };
  const get = async <T>(path: string, headers = apiAuthHeaders()): Promise<T> => {
    const response = await request.get(`${API}${path}`, { headers });
    expect(response.ok(), `GET ${path} → ${response.status()} ${await response.text()}`).toBe(true);
    return response.json() as Promise<T>;
  };

  // ── The commercial origin ──────────────────────────────────────────────────
  const account = await post<{ id: string; name: string }>('/crm/accounts', { name: `${title} Account` });
  const opportunity = await post<{ id: string }>('/crm/opportunities', {
    title, value: 600_000, accountId: account.id, accountName: account.name, executionType: 'tender',
  });
  const tender = await post<{ id: string }>('/tendering/tenders', {
    title: `${title} Tender`, value: 600_000, accountId: account.id, accountName: account.name,
    status: 'submitted', sourceOpportunityId: opportunity.id,
  });
  await post('/tendering/bid-scores', { tenderId: tender.id, criteria: [{ name: 'Strategic fit', weight: 1, score: 8 }], notes: 'Governed progress fixture' });

  // ── The technical study, independently approved ────────────────────────────
  const study = await post<{ id: string }>(`/tendering/tenders/${tender.id}/studies`, {
    title: `${title} technical study`,
    inputRevision: 'Client specification Rev 01',
    // The study names its reviewer before it is submitted, and only that person may approve it.
    reviewerId: technical.id,
    scopeSummary: title,
    systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'Approved test basis', interfaces: [] }],
    requirements: [{ category: 'client', statement: `${quantity} ${unit} required`, acceptanceCriteria: 'Install and test', compliance: 'compliant', response: 'Included' }],
    surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
  });
  await post(`/tendering/tenders/${tender.id}/studies/${study.id}/submit`, {});
  await post(`/tendering/tenders/${tender.id}/studies/${study.id}/approve`, { comment: 'Approved for estimation' }, technical.headers);

  // ── The take-off that becomes the BOQ ──────────────────────────────────────
  await patch(`/tendering/tenders/${tender.id}/status`, { status: 'estimating' });
  const takeoff = await post<{ id: string }>(`/tendering/tenders/${tender.id}/quantity-takeoff`, { lines: [{ description: title, unit, quantity }] });
  await post(`/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/approve`, {}, technical.headers);
  const projection = await post<{ items: Array<{ id: string }> }>(`/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/project-to-boq`, {});
  const projectedItem = projection.items[0];
  await post('/tendering/estimates', {
    boqItemId: projectedItem.id,
    components: [{ costType: 'material', description: title, quantity: 1, unitCost: 100 }],
    applyToBoq: false,
  });

  // ── The offer, its readiness evidence, and its independent approval ────────
  await patch(`/tendering/tenders/${tender.id}/status`, { status: 'priced' });
  const quotation = await post<{ id: string }>(`/tendering/tenders/${tender.id}/quotation`, {});
  // A governed quotation carries a seeded evidence checklist, and approval is refused until every
  // required item has evidence recorded against it.
  await post('/document-requirements/seed', { entityType: 'crm.quotation', entityId: quotation.id });
  const checklist = await get<{ requirements: Array<{ id: string; type: string; requiredCount: number }> }>(
    `/document-requirements?entityType=crm.quotation&entityId=${quotation.id}`);
  for (const requirement of checklist.requirements) {
    for (let index = 0; index < requirement.requiredCount; index += 1) {
      await post(`/document-requirements/${requirement.id}/evidence`, {
        type: requirement.type === 'VENDOR_QUOTE' ? 'EXTERNAL_REFERENCE' : 'DOCUMENT_ID',
        reference: `${title}-${requirement.type}-${index + 1}`,
      });
    }
  }
  await patch(`/crm/quotations/${quotation.id}/status`, { action: 'submit_review' });
  await patch(`/crm/quotations/${quotation.id}/status`, { action: 'approve' }, commercial.headers);

  // ── Award → contract → project, each produced by the one before it ─────────
  await post(`/tendering/tenders/${tender.id}/award`, {
    awardedValue: 600_000, currency: 'AED', awardedAt: '2026-08-25T07:30:00.000Z', awardReference: `LOA-${title}`,
  }, commercial.headers);
  let contractId: string | null = null;
  await expect.poll(async () => {
    const contracts = await get<Array<{ id: string }>>(`/contracts/contracts?tenderId=${tender.id}`);
    contractId = contracts[0]?.id ?? null;
    return contractId;
  }, { timeout: 20_000, message: 'the governed award did not produce a contract' }).not.toBeNull();
  await patch(`/contracts/contracts/${contractId}/status`, { status: 'active' });

  interface HandedOverProject {
    id: string;
    handoverSnapshot: { sourceItems: Array<{ frozenItemKey: string; sourceItemId: string; soldQuantity: number; unit: string }> };
  }
  let project: HandedOverProject | null = null;
  await expect.poll(async () => {
    const projects = await get<HandedOverProject[]>(`/projects/projects?contractId=${contractId}`);
    project = projects[0] ?? null;
    return project?.id ?? null;
  }, { timeout: 20_000, message: 'the active contract did not produce a project' }).not.toBeNull();
  const handed = project as unknown as HandedOverProject;
  const soldItem = handed.handoverSnapshot?.sourceItems?.[0];
  expect(soldItem, 'the governed handover did not preserve the frozen sold item').toBeTruthy();
  expect(soldItem.soldQuantity).toBe(quantity);

  // ── The work package the sold item is delivered through ────────────────────
  const node = await post<{ id: string }>('/projects/wbs', {
    projectId: handed.id, code: `1.${title.slice(0, 8)}`, title: `${title} delivery`,
    plannedValue: options.plannedValue ?? 100_000, boqItemId: soldItem.sourceItemId,
  });
  await post('/projects/delivery-item-maps', { projectId: handed.id, frozenItemKey: soldItem.frozenItemKey, wbsNodeId: node.id });
  // The mapping is what makes this package quantity-controlled: until the ledger knows the sold
  // figure, "75%" has no denominator.
  await expect.poll(
    async () => (await get<{ sold: number | null }>(`/projects/quantity-ledger/position/${soldItem.sourceItemId}`)).sold,
    { timeout: 20_000, message: 'the mapped sold quantity never reached the Quantity Ledger' },
  ).toBe(quantity);

  return { projectId: handed.id, boqItemId: soldItem.sourceItemId, wbsNodeId: node.id, soldQuantity: quantity, unit, cleanup };
}
