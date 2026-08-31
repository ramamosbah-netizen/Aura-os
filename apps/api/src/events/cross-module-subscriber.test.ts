import { describe, it, expect, beforeEach } from 'vitest';
import { makeEvent, resolveDealOutcome } from '@aura/shared';
import {
  EventBus,
  InMemoryEventStore,
  NullTxRunner,
  AccessService,
  IdempotencyService,
  LockService,
  CommandBus,
  NumberingService,
  AuditService,
  TenantContext,
} from '@aura/core';
import { OpportunityService, InMemoryOpportunityStore } from '@aura/crm';
import { TenderService, InMemoryTenderStore, InMemoryBOQStore, InMemoryBidScoreStore, InMemoryEstimateStore, InMemorySubmissionStore } from '@aura/tendering';
import { ContractService, InMemoryContractStore } from '@aura/contracts';
import {
  ProjectService,
  InMemoryProjectStore,
  WbsService,
  InMemoryWbsStore,
  CbsService,
  InMemoryCbsStore,
  CostLedgerService,
  InMemoryCostLedgerStore,
  QuantityLedgerService,
  InMemoryQuantityLedgerStore,
} from '@aura/projects';
import { CustomerInvoiceService, InMemoryCustomerInvoiceStore } from '@aura/finance';
import { CrossModuleSubscriber } from './cross-module-subscriber';

/**
 * End-to-end proof that the deal chain is wired and automated through the
 * event reactor (CrossModuleSubscriber) — entirely in-memory, no DB, no Nest DI.
 *
 * Drives the real services and lets the InMemoryEventStore relay each emitted
 * event to the bus (the stand-in for the Postgres outbox relay), exactly as
 * production does. Asserts every downstream record is auto-created with the
 * source references carried down, that the chain is idempotent under event
 * re-delivery, and that an auto-created project is seeded with WBS + CBS.
 */
const tenantId = 'tenant-e2e';

/**
 * `pricedQuote` seeds a tender-sourced quotation with a locked commercial baseline, so the
 * tender→contract reactor's R3 inheritance (G-50) can be exercised. Omitted → no quotes, which is
 * the "awarded straight off the estimate" path every other test here uses.
 */
function buildHarness(pricedQuote?: { id: string; status: string; baselineId: string; total: number; cost?: number }) {
  let quotationsStub: Record<string, unknown> = {};
  const linkedContracts: Array<{ quotationId: string; contractId: string }> = [];
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const tx = new NullTxRunner();
  const access = new AccessService();
  const idempotency = new IdempotencyService(null);
  const lock = new LockService();
  const commands = new CommandBus(access, idempotency, lock, tx);
  const numbering = new NumberingService(null);
  const tenant = new TenantContext();
  const audit = new AuditService(null, tenant);

  // CRM
  const opportunities = new OpportunityService(
    new InMemoryOpportunityStore(),
    events,
    tx,
    access,
    // AiService isn't constructed here; opportunity.update never calls the model.
    { complete: async () => ({ text: '' }) } as any,
    // Governance resolver — the tender-chain reactors close via applyTenderOutcome, not the Won-block.
    { classify: async () => 'direct_legacy' as const },
  );

  // Deal-chain services (each registers its create command on the shared bus).
  const bidScoreStore = new InMemoryBidScoreStore();
  const estimateStore = new InMemoryEstimateStore();
  const tenders = new TenderService(
    new InMemoryTenderStore(),
    new InMemoryBOQStore(),
    bidScoreStore,
    estimateStore,
    new InMemorySubmissionStore(),
    events,
    tx,
    commands,
    numbering,
    audit,
  );
  const contracts = new ContractService(new InMemoryContractStore(), events, tx, commands);
  const projects = new ProjectService(new InMemoryProjectStore(), events, tx, commands);
  const cbs = new CbsService(new InMemoryCbsStore(), events);
  const quantityLedger = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
  const wbs = new WbsService(new InMemoryWbsStore(), events, access, quantityLedger);
  const ledger = new CostLedgerService(new InMemoryCostLedgerStore(), cbs);
  const customerInvoices = new CustomerInvoiceService(new InMemoryCustomerInvoiceStore(), events, { getRate: async () => 1 } as any);

  // Register command handlers (Nest would call these via OnModuleInit).
  tenders.onModuleInit();
  contracts.onModuleInit();
  projects.onModuleInit();

  // Services the reactor depends on but these tests don't exercise.
  const noop = {} as any;

  const mockFinanceAccounts = {
    getByCode: async (tenantId: string, code: string) => {
      return { id: `acc-${code}`, code, name: `Account ${code}` };
    },
    create: async (input: any) => {
      return { id: `acc-${input.code}`, code: input.code, name: input.name };
    },
  } as any;

  const postedJournals: any[] = [];
  const mockJournals = {
    list: async (filter: any) => {
      return postedJournals.filter(j => j.reference === filter.reference);
    },
    post: async (input: any) => {
      postedJournals.push(input);
      return { id: 'journal-1', ...input };
    },
  } as any;

  const createdApInvoices: any[] = [];
  const usedIdempotencyKeys = new Set<string>();
  const mockSupplierInvoices = {
    create: async (input: any, idempotencyKey?: string) => {
      if (idempotencyKey && usedIdempotencyKeys.has(idempotencyKey)) {
        return createdApInvoices.find((i: any) => true); // return first as cached
      }
      if (idempotencyKey) usedIdempotencyKeys.add(idempotencyKey);
      const invoice = { id: `inv-${createdApInvoices.length + 1}`, ...input };
      createdApInvoices.push(invoice);
      return invoice;
    },
  } as any;

  const createdPrs: any[] = [];
  const mockPurchaseRequests = {
    create: async (input: any) => {
      const pr = { id: `pr-${createdPrs.length + 1}`, ...input };
      createdPrs.push(pr);
      return pr;
    },
  } as any;

  const createdVariations: any[] = [];
  const mockVariations = {
    list: async () => createdVariations,
    create: async (input: any) => {
      const vo = { id: `vo-${createdVariations.length + 1}`, ...input };
      createdVariations.push(vo);
      return vo;
    },
  } as any;

  const createdRas: any[] = [];
  const mockHse = {
    listRiskAssessments: async () => createdRas,
    createRiskAssessment: async (input: any) => {
      const ra = { id: `ra-${createdRas.length + 1}`, ...input };
      createdRas.push(ra);
      return ra;
    },
  } as any;

  // SignalService (CRM) — records growth signals; idempotent on dedupeKey (mirrors the real create).
  const createdSignals: any[] = [];
  const mockSignals = {
    create: async (input: any) => {
      if (input.dedupeKey && createdSignals.some((s) => s.dedupeKey === input.dedupeKey)) {
        return createdSignals.find((s) => s.dedupeKey === input.dedupeKey);
      }
      const signal = { id: `sig-${createdSignals.length + 1}`, status: 'NEW', ...input };
      createdSignals.push(signal);
      return signal;
    },
  } as any;

  const subscriber = new CrossModuleSubscriber(
    bus,
    contracts,
    projects,
    wbs,
    cbs,
    ledger, // CostLedgerService
    quantityLedger, // QuantityLedgerService
    mockVariations, // VariationService
    tenant,
    noop, // PurchaseOrderService
    mockPurchaseRequests,
    tenders,
    { restampFromAward: async () => 0 } as any, // EstimateSourcingService (R5)
    noop, // AccountService (CRM)
    opportunities, // OpportunityService (CRM) — required for the tender.awarded → close-opportunity reactor
    mockSignals, // SignalService (CRM)
    // QuotationService (CRM). Two jobs on the award path: whether a tender's quotation is already
    // committed (so a frozen estimate is never silently restamped), and — since G-50 — supplying
    // the approved commercial baseline the contract must inherit.
    (quotationsStub = {
      listBySourceTender: async () => [],
      list: async () => (pricedQuote ? [{ id: pricedQuote.id, status: pricedQuote.status }] : []),
      getBaseline: async (_t: string, qid: string) =>
        pricedQuote && qid === pricedQuote.id ? { id: pricedQuote.baselineId, total: pricedQuote.total } : null,
      // The locked event names the baseline as its aggregate, so the deferred reactor reads it by id.
      getBaselineById: async (_t: string, bid: string) =>
        pricedQuote && bid === pricedQuote.baselineId
          ? { id: pricedQuote.baselineId, quotationId: pricedQuote.id, revision: 0, total: pricedQuote.total,
              lines: [{ description: 'Frozen line', quantity: 1, unitPrice: pricedQuote.total, lineNet: pricedQuote.total, vatRate: 0 }],
              // Deliberately leave the compatibility pricing shape costless: the assertion below
              // proves the canonical estimation build-up wins when both projections are present.
              pricing: pricedQuote.cost !== undefined ? { lines: [{ supplyUnitPrice: 0, wastagePercent: 0, accessories: 0, technician: { count: 0, hours: 0, rate: 0 }, engineer: { count: 0, hours: 0, rate: 0 }, projectManager: { count: 0, hours: 0, rate: 0 }, transport: 0, equipmentRent: 0, subcontract: 0, otherDirect: 0, indirectPercent: 0 }] } : null,
              // Pricing-sheet authored quotations carry both a compatibility pricing shape and
              // the canonical estimation build-up. The reactor must prefer estimation for cost.
              estimation: pricedQuote.cost !== undefined ? [{ description: 'Frozen line', quantity: 1, materialUnitCost: pricedQuote.cost, wastagePercent: 0, labour: { hoursPerUnit: 0, crewSize: 1, hourlyRate: 0 }, equipmentUnitCost: 0, consumablesUnitCost: 0, subcontractUnitCost: 0, overheadPercent: 0, riskPercent: 0, warrantyPercent: 0, contingencyPercent: 0, targetMarginPercent: 0 }] : null,
              sourceTenderId: (globalThis as Record<string, unknown>).__deferredTenderId ?? null,
              lockedAt: '2026-08-22T09:00:00.000Z' }
          : null,
      linkContract: async (qid: string, contractId: string) => {
        linkedContracts.push({ quotationId: qid, contractId });
      },
    }) as any,
    // PreAwardPackageService (CRM) — the Slice 9 accept→Won reactor reads the current frozen pricing
    // sheet for its lineage guard. These tender-chain tests never emit quotation.accepted, so a null
    // (no governed package) is enough.
    { frozenPricingFor: async () => null } as any,
    customerInvoices,
    mockSupplierInvoices, // InvoiceService (AP)
    mockFinanceAccounts, // AccountService (Finance) — GL account resolver
    mockJournals, // JournalService
    mockHse, // HseService
  );
  subscriber.onModuleInit(); // subscribe the reactor to the bus

  return { bus, events, opportunities, tenders, contracts, projects, wbs, cbs, customerInvoices, bidScoreStore, estimateStore, postedJournals, createdApInvoices, createdPrs, createdVariations, createdRas, signals: mockSignals, createdSignals, linkedContracts, quotationsStub };
}

/**
 * Walk a started tender to `submitted` so its AWARD can fire the deal-chain reactors. The submit
 * gate reads evidence, not visited states (T2): a go bid-decision + a priced estimate + a value.
 * We seed those facts directly, then flip to submitted (which records the submission).
 */
async function makeTenderSubmittable(h: ReturnType<typeof buildHarness>, tenderId: string): Promise<void> {
  await h.bidScoreStore.save({ id: `bs-${tenderId}`, tenantId, tenderId, recommendation: 'go', createdAt: new Date().toISOString() } as any);
  await h.estimateStore.save({ id: `est-${tenderId}`, tenantId, tenderId, sellingRate: 100, quantity: 1 } as any);
  await h.tenders.changeStatus(tenderId, 'submitted');
}

/** The customer's award date. Deliberately in the past so "this is not a now() stamp" stays provable. */
const CUSTOMER_AWARDED_AT = '2026-08-21T07:30:00.000Z';

/**
 * ADR-0021 — award a tender the ONLY governed way: with the customer's award evidence. Reaching
 * `won` by flipping status is refused by the service, so every deal-chain test now goes through here.
 */
/**
 * Resolve the award-time commercial basis the way the app layer does. The controller owns this in
 * production (only it may read tendering -> quotation -> baseline); mirroring it here keeps the test
 * exercising the real shape rather than a convenience.
 */
async function awardBasis(h: ReturnType<typeof buildHarness>) {
  const quotes = await (h.quotationsStub as { list: () => Promise<Array<{ id: string; status: string }>> }).list();
  const rank = (s: string): number => (s === 'accepted' ? 0 : s === 'approved' ? 1 : s === 'sent' ? 2 : 3);
  for (const q of quotes.filter((x) => rank(x.status) < 3).sort((a, b) => rank(a.status) - rank(b.status))) {
    const b = await (h.quotationsStub as { getBaseline: (t: string, q: string) => Promise<{ id: string; total: number } | null> }).getBaseline(tenantId, q.id);
    if (b) return { baselineId: b.id, quotationId: q.id, value: b.total };
  }
  return null;
}

async function awardTender(
  h: ReturnType<typeof buildHarness>,
  tenderId: string,
  over: Partial<{ awardedValue: number; currency: string; awardedAt: string; awardReference: string | null }> = {},
) {
  const basis = await awardBasis(h);
  return h.tenders.award(tenderId, {
    awardedValue: 1_000_000,
    currency: 'AED',
    awardedAt: CUSTOMER_AWARDED_AT,
    awardReference: 'LOA-2026-77',
    capturedBy: 'u-bid-manager',
    ...over,
  }, basis);
}

/**
 * A LEGACY / pre-ADR-0021 award: the `awarded` event fires for a tender that carries no customer
 * award evidence. This is how historical rows (won before evidence existed) still reach the reactor,
 * and it is the only remaining way to produce an unevidenced win — the governed command cannot.
 */
async function awardWithoutEvidence(h: ReturnType<typeof buildHarness>, tenderId: string): Promise<void> {
  const tender = (await h.tenders.get(tenderId))!;
  await h.bus.publish(makeEvent({
    type: 'tendering.tender.awarded',
    tenantId: tender.tenantId,
    companyId: tender.companyId,
    actorId: null,
    aggregateType: 'tendering.tender',
    aggregateId: tender.id,
    payload: {
      title: tender.title,
      status: 'won',
      value: tender.value,
      account: tender.accountId ? { id: tender.accountId, name: tender.accountName } : null,
    },
  }));
}

describe('reactor failure policy — the outbox is the error handler', () => {
  let h: ReturnType<typeof buildHarness>;
  // Priced, so the award actually reaches `contracts.create` — with no commercial basis the reactor
  // returns early and there would be nothing to fail.
  beforeEach(() => { h = buildHarness({ id: 'q-fail', status: 'approved', baselineId: 'baseline-fail', total: 500 }); });

  /**
   * OutboxRelay decides retry-vs-done purely by whether `bus.publish` rejects: resolve stamps
   * `processed_at`, throw increments `attempts` and retries, dead-lettering after MAX_ATTEMPTS.
   * Every reactor used to swallow, so publish always resolved and the retry policy was INERT — a
   * failed contract creation was marked delivered and lost with only a log line.
   *
   * NOTE ON THIS HARNESS: `InMemoryEventStore.append` publishes INLINE, so here a propagated failure
   * surfaces out of the command that emitted the event. Under Postgres the relay publishes AFTER the
   * business transaction commits, so the same throw reaches the relay instead — which is the point.
   * What both paths share, and what this asserts, is that the failure is no longer swallowed.
   */
  it('a RETRYABLE reactor PROPAGATES its failure, so the relay retries instead of marking it done', async () => {
    const opp = await h.opportunities.create({ tenantId, title: 'Retry Job', value: 500 });
    const tender = await h.tenders.create({ tenantId, title: 'Tender: Retry Job', value: 500 });
    await h.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(h, tender.id);

    // Exactly the transient shape this codebase has hit before: a dropped pool connection.
    h.contracts.create = async () => { throw new Error('boom-dropped-connection'); };

    await expect(awardTender(h, tender.id)).rejects.toThrow(/boom-dropped-connection/);
  });

  it('a BEST-EFFORT reactor SWALLOWS, so optional enrichment cannot block the event', async () => {
    // The growth-Signal reactor on project.completed is enrichment: losing a Signal must never stop
    // a project from completing. It stays swallowed deliberately.
    const failing = buildHarness();
    failing.signals.create = async () => { throw new Error('boom-signal'); };
    const contract = await failing.contracts.create({ tenantId, title: 'C', value: 10, status: 'active' });
    const project = await failing.projects.create({ tenantId, title: 'P', contractId: contract.id });
    // Walk the project to its valid pre-completed state (planned → active → completed). Completing it
    // fires BOTH project.completed reactors: the growth-Signal one (throws here) and the contract-close
    // one (which completes the active contract, in turn firing the renewal-Signal reactor — also a throw).
    // Every Signal write fails; the completion must still resolve, proving those swallows hold.
    await failing.projects.changeStatus(project.id, 'active');

    await expect(failing.projects.changeStatus(project.id, 'completed')).resolves.toBeDefined();
  });
});

describe('CrossModuleSubscriber — deal chain automation (in-memory E2E)', () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    // A tender priced through an approved quotation is the ORDINARY case: it has a commercial basis,
    // so the deal chain produces a contract. Tests about the no-basis path build their own harness.
    h = buildHarness({ id: 'q-default', status: 'approved', baselineId: 'baseline-default', total: 900_000 });
  });

  it('auto-creates Tender → Contract → Project, carrying references down the chain', async () => {
    // 1. Opportunity (for a client account) won → Tender (draft), named after the
    //    opportunity and carrying the client snapshot down from the very first link.
    const opp = await h.opportunities.create({
      tenantId,
      title: 'Marina Tower ELV',
      value: 1_000_000,
      accountId: 'acct-1',
      accountName: 'Acme Developments LLC',
    });
    // Start Tender from the still-open opportunity (J2): the tender is created against the
    // opportunity and linked back (sourceOpportunityId), carrying the client snapshot down.
    // (Causality: bidding precedes winning — the tender's AWARD is what wins the deal, below.)
    const tender = await h.tenders.create({
      tenantId,
      title: 'Tender: Marina Tower ELV',
      value: 1_000_000,
      accountId: 'acct-1',
      accountName: 'Acme Developments LLC',
    });
    await h.tenders.linkOpportunity(tender.id, opp.id);
    expect(tender.accountName).toBe('Acme Developments LLC'); // opportunity→tender account carry-down

    // 2. Tender submitted, then awarded → Contract (draft) AND the source opportunity closes Won.
    await makeTenderSubmittable(h, tender.id);
    await awardTender(h, tender.id);
    expect((await h.opportunities.get(opp.id))?.stage).toBe('won'); // tender.awarded → close-opportunity
    // The contract is valued from the approved COMMERCIAL BASIS (900k), never from the tender's own
    // 1M estimate. The two being different is the assertion — while the fallback existed they were
    // always the same number, so nothing could tell them apart.
    expect(tender.value).toBe(1_000_000);
    const contracts = await h.contracts.list({ tenderId: tender.id });
    expect(contracts).toHaveLength(1);
    expect(contracts[0].tenderId).toBe(tender.id);
    expect(contracts[0].accountName).toBe('Acme Developments LLC');
    expect(contracts[0].value).toBe(900_000);                  // the approved basis…
    expect(contracts[0].commercialBaselineId).toBe('baseline-default');
    expect(contracts[0].value).not.toBe(tender.value);          // …and NOT the tender's estimate
    const contract = contracts[0];

    // 3. Contract signed → Project (planned).
    await h.contracts.changeStatus(contract.id, 'active');
    const projects = await h.projects.list({ contractId: contract.id });
    expect(projects).toHaveLength(1);
    expect(projects[0].contractId).toBe(contract.id);
    expect(projects[0].accountName).toBe('Acme Developments LLC');
    // The project inherits the CONTRACT's value, which is the approved basis — so the basis now
    // propagates all the way down the chain instead of the tender's estimate doing so.
    expect(projects[0].value).toBe(900_000);
  });

  it('seeds one locked CBS opening node only from frozen baseline cost evidence', async () => {
    const priced = buildHarness({ id: 'q-cbs-seed', status: 'accepted', baselineId: 'baseline-cbs-seed', total: 900_000, cost: 600_000 });
    const opp = await priced.opportunities.create({ tenantId, title: 'CBS seeded job', value: 900_000 });
    const tender = await priced.tenders.create({ tenantId, title: 'Tender: CBS seeded job', value: 900_000 });
    await priced.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(priced, tender.id);
    await awardTender(priced, tender.id);
    const [contract] = await priced.contracts.list({ tenderId: tender.id });
    await priced.contracts.changeStatus(contract.id, 'active');

    const project = (await priced.projects.list({ contractId: contract.id }))[0];
    const nodes = await priced.cbs.list({ projectId: project.id });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ budgetAmount: 600_000, forecastAmount: 600_000, handoverLocked: true, sourceRevisionId: 'baseline-cbs-seed' });

    // The replay guard must not create a second opening baseline.
    await priced.contracts.changeStatus(contract.id, 'active');
    expect(await priced.cbs.list({ projectId: project.id })).toHaveLength(1);
  });

  // G-50 — path-asymmetry. The DIRECT path locks a commercial baseline on quotation approval and
  // the contract inherits it. The tender path used to take the tender's own ESTIMATE and leave the
  // baseline null: same business intent, weaker governance, purely because of which route the deal
  // took. A tender priced through a quotation must now produce the same governed contract.
  it('a tender-won contract inherits the approved commercial baseline, not the estimate', async () => {
    const priced = buildHarness({ id: 'q-tender-1', status: 'accepted', baselineId: 'baseline-77', total: 1_575_000 });
    const opp = await priced.opportunities.create({ tenantId, title: 'Baselined Job', value: 1_400_000 });
    // The tender's own estimate is 1.4M; the bid the customer accepted is 1.575M.
    const tender = await priced.tenders.create({ tenantId, title: 'Tender: Baselined Job', value: 1_400_000 });
    await priced.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(priced, tender.id);
    await awardTender(priced, tender.id);

    const [contract] = await priced.contracts.list({ tenderId: tender.id });
    expect(contract.commercialBaselineId).toBe('baseline-77'); // was null before G-50
    expect(contract.value).toBe(1_575_000); // the accepted bid, NOT the 1.4M estimate
    // Provenance closes both ways, as it does on the direct path.
    expect(priced.linkedContracts).toEqual([{ quotationId: 'q-tender-1', contractId: contract.id }]);
  });

  // ADR-0021 — TENDER AWARD PROVENANCE from the CUSTOMER'S EVIDENCE, end to end through the real
  // reactor.
  //
  // SEMANTIC CORRECTION, deliberate and NOT a refactor. The previous behaviour (shipped under the
  // ADR-0020 follow-up) stamped provenance from the approved Commercial Baseline, so a baselined
  // tender was GOVERNED_WON on the strength of OUR OWN approved offer. ADR-0021 separates the two
  // concepts: the baseline is the offer/commercial basis and still governs the contract, while only
  // the customer's captured award evidence is authority for what was awarded.
  //
  // The award value here (1,725,000) deliberately DIFFERS from the baseline (1,575,000) — that gap is
  // the whole point. It proves the deal takes the awarded figure and not the approved offer, which no
  // test could show while the two were the same number.
  it('a tender award stamps provenance from the CUSTOMER award value, not the approved baseline', async () => {
    const priced = buildHarness({ id: 'q-tender-2', status: 'accepted', baselineId: 'baseline-88', total: 1_575_000 });
    const opp = await priced.opportunities.create({ tenantId, title: 'Evidenced Job', value: 1_400_000 });
    const tender = await priced.tenders.create({ tenantId, title: 'Tender: Evidenced Job', value: 1_400_000 });
    await priced.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(priced, tender.id);
    await awardTender(priced, tender.id, { awardedValue: 1_725_000 });

    const won = (await priced.opportunities.get(opp.id))!;
    expect(won.stage).toBe('won');
    expect(won.awardSource).toBe('tender_award');
    expect(won.contractedValue).toBe(1_725_000);  // what the CUSTOMER awarded
    expect(won.contractedValue).not.toBe(1_575_000); // NOT the approved baseline
    expect(won.value).toBe(1_400_000);            // the headline is NOT overwritten by the award
    // The award's own date, carried from the evidence — not the reactor's now().
    expect(won.awardedAt).toBe(CUSTOMER_AWARDED_AT);
    // The customer awarded the TENDER; there is no accepted quotation revision to name here.
    expect(won.awardedQuotationId).toBeNull();

    // SEPARATION OF CONCEPTS, asserted in one place: the CONTRACT still inherits the approved
    // baseline (its offer basis, G-50) while the DEAL carries the customer's award value. They are
    // allowed to differ, and before ADR-0021 they could not.
    const [contract] = await priced.contracts.list({ tenderId: tender.id });
    expect(contract.value).toBe(1_575_000);
    expect(contract.commercialBaselineId).toBe('baseline-88');

    // The win is evidenced, and the qualification-at-award snapshot follows from the provenance —
    // with no tender-specific logic anywhere in the snapshot path.
    const outcome = resolveDealOutcome(won);
    expect(outcome.state).toBe('GOVERNED_WON');
    expect(outcome.awardValue).toBe(1_725_000);
    expect(won.qualificationAtAward).not.toBeNull();
    expect(won.qualificationAtAward!.awardSource).toBe('tender_award');
    expect(won.qualificationAtAward!.capturedAt).toBe(won.awardedAt);
  });

  // ADR-0021 — THE CONSEQUENCE, stated as a test: an approved baseline is NOT a substitute for
  // customer award evidence. This deal has a fully approved, baselined quotation behind it and still
  // reads LEGACY_WON, because nobody captured what the customer actually awarded.
  it('a BASELINED tender awarded with no customer evidence still reads LEGACY_WON', async () => {
    const priced = buildHarness({ id: 'q-tender-9', status: 'accepted', baselineId: 'baseline-99', total: 2_000_000 });
    const opp = await priced.opportunities.create({ tenantId, title: 'Baselined but unevidenced', value: 1_900_000 });
    const tender = await priced.tenders.create({ tenantId, title: 'Tender: Baselined unevidenced', value: 1_900_000 });
    await priced.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(priced, tender.id);
    await awardWithoutEvidence(priced, tender.id);

    const won = (await priced.opportunities.get(opp.id))!;
    expect(won.stage).toBe('won');
    expect(won.awardSource).toBeNull();
    expect(won.contractedValue).toBeNull();          // the 2M baseline did NOT become an award value
    expect(resolveDealOutcome(won).state).toBe('LEGACY_WON');
    expect(won.qualificationAtAward).toBeNull();

    // …and NO contract exists. A legacy award event pins no commercial basis (it never went through
    // the governed `award()`), and the follow-up rule is absolute: no basis, no contract. The 2M
    // baseline is still the approved offer — it simply has not been linked to this award, and only a
    // `crm.commercial_baseline.locked` event can do that. A tender won before this model existed
    // therefore waits for a basis rather than inheriting one chosen at delivery time.
    expect((await priced.tenders.get(tender.id))!.commercialBasis).toBeNull();
    expect(await priced.contracts.list({ tenderId: tender.id })).toEqual([]);
  });

  // The other half of the invariant, through the real reactor: with no approved baseline there is no
  // authoritative number, so no provenance is claimed. The tender's own ESTIMATE is not promoted —
  // it is what the contract falls back to, which is a draft value, not a claim about what was awarded.
  it('an unbaselined tender award records the win WITHOUT provenance rather than banking the estimate', async () => {
    const opp = await h.opportunities.create({ tenantId, title: 'Unevidenced Job', value: 800_000 });
    const tender = await h.tenders.create({ tenantId, title: 'Tender: Unevidenced Job', value: 800_000 });
    await h.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(h, tender.id);
    await awardWithoutEvidence(h, tender.id);

    const won = (await h.opportunities.get(opp.id))!;
    expect(won.stage).toBe('won');
    expect(won.awardSource).toBeNull();
    expect(won.contractedValue).toBeNull();   // the 800k estimate did NOT become a contracted value
    expect(won.awardedAt).toBeNull();
    expect(won.qualificationAtAward).toBeNull();
    expect(resolveDealOutcome(won).state).toBe('LEGACY_WON');
    // THE invariant, asserted where the wiring actually runs.
    const outcome = resolveDealOutcome(won);
    expect(outcome.awardDocumented && outcome.awardValue == null).toBe(false);
  });

  // SEMANTIC CORRECTION, deliberate and NOT a refactor. This test used to assert that an unpriced
  // tender still produced a contract valued at the tender's own ESTIMATE. That estimate then flowed
  // into PaymentCertificateService as `contractValue` and drove IPC maths — an internal guess
  // wearing a contractual number. ADR-0021's vocabulary forbids exactly that conflation.
  //
  // Now: no commercial basis, no contract. The award itself stays valid.
  it('NO commercial basis → NO contract; the tender estimate is never banked as a contract value', async () => {
    const unpriced = buildHarness(); // deliberately no priced quotation behind the tender
    const opp = await unpriced.opportunities.create({ tenantId, title: 'Unpriced Job', value: 800_000 });
    const tender = await unpriced.tenders.create({ tenantId, title: 'Tender: Unpriced Job', value: 800_000 });
    await unpriced.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(unpriced, tender.id);
    await awardTender(unpriced, tender.id);

    // The win is real and governed…
    const won = (await unpriced.opportunities.get(opp.id))!;
    expect(won.stage).toBe('won');
    expect(resolveDealOutcome(won).state).toBe('GOVERNED_WON');
    // …and the tender is awaiting a commercial basis, so no contract was invented for it.
    expect((await unpriced.tenders.get(tender.id))!.commercialBasis).toBeNull();
    expect(await unpriced.contracts.list({ tenderId: tender.id })).toEqual([]);
    expect(unpriced.linkedContracts).toEqual([]);
  });

  // The deferred half: the baseline arrives later and the contract is built THEN, from that basis,
  // recorded as POST_AWARD_LINKED so the timing is never misreported as award-time.
  it('a baseline locked AFTER the award links as POST_AWARD_LINKED and builds the deferred contract', async () => {
    const late = buildHarness({ id: 'q-late', status: 'approved', baselineId: 'baseline-late', total: 640_000 });
    const opp = await late.opportunities.create({ tenantId, title: 'Deferred Job', value: 600_000 });
    const tender = await late.tenders.create({ tenantId, title: 'Tender: Deferred Job', value: 600_000 });
    await late.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(late, tender.id);

    // Award with NO basis available at that moment.
    (globalThis as Record<string, unknown>).__deferredTenderId = tender.id;
    await late.tenders.award(tender.id, {
      awardedValue: 700_000, currency: 'AED', awardedAt: CUSTOMER_AWARDED_AT, capturedBy: 'u-bid-manager',
    }, null);
    expect(await late.contracts.list({ tenderId: tender.id })).toEqual([]); // deferred, not lost

    // …then the baseline locks.
    await late.bus.publish(makeEvent({
      type: 'crm.commercial_baseline.locked',
      tenantId, companyId: null, actorId: 'u-commercial',
      aggregateType: 'crm.commercial_baseline', aggregateId: 'baseline-late',
      payload: { quotationId: 'q-late', quoteNumber: 'Q-LATE', total: 640_000 },
    }));

    const basis = (await late.tenders.get(tender.id))!.commercialBasis!;
    expect(basis.kind).toBe('POST_AWARD_LINKED');           // NOT award-time — a different claim
    expect(basis.baselineId).toBe('baseline-late');
    const [contract] = await late.contracts.list({ tenderId: tender.id });
    expect(contract.value).toBe(640_000);                   // the approved offer, not the 700k award
    expect(contract.commercialBaselineId).toBe('baseline-late');
    delete (globalThis as Record<string, unknown>).__deferredTenderId;
  });

  it('is idempotent: re-delivered award/sign events do not duplicate downstream records', async () => {
    const opp = await h.opportunities.create({ tenantId, title: 'Idem Job', value: 500 });
    // Start Tender from the opportunity, then award it twice (simulates at-least-once re-delivery).
    const tender = await h.tenders.create({ tenantId, title: 'Tender: Idem Job', value: 500 });
    await h.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(h, tender.id);

    await awardTender(h, tender.id);
    await awardTender(h, tender.id); // replay: write-once, must not duplicate anything
    expect(await h.contracts.list({ tenderId: tender.id })).toHaveLength(1);

    const contract = (await h.contracts.list({ tenderId: tender.id }))[0];
    // Sign the contract twice.
    await h.contracts.changeStatus(contract.id, 'active');
    const firstProject = (await h.projects.list({ contractId: contract.id }))[0];
    await h.contracts.changeStatus(contract.id, 'active');
    const replayedProjects = await h.projects.list({ contractId: contract.id });
    expect(replayedProjects).toHaveLength(1);
    expect(replayedProjects[0].handoverId).toBe(firstProject.handoverId);
    expect(replayedProjects[0].handoverSnapshotHash).toBe(firstProject.handoverSnapshotHash);
    expect(replayedProjects[0].handoverSnapshot).toEqual(firstProject.handoverSnapshot);

    // Re-awarding must not spawn a second contract, and only the one started tender exists.
    expect(await h.tenders.list()).toHaveLength(1);
  });

  it('raises deduped growth Signals when a project and its contract complete (S9 account growth loop)', async () => {
    // Build the full chain to a live project.
    const opp = await h.opportunities.create({ tenantId, title: 'Downtown ELV', value: 800_000, accountId: 'acct-9', accountName: 'Nakheel PJSC' });
    // Start Tender from the opportunity, then award it to win the deal.
    const tender = await h.tenders.create({ tenantId, title: 'Tender: Downtown ELV', value: 800_000, accountId: 'acct-9', accountName: 'Nakheel PJSC' });
    await h.tenders.linkOpportunity(tender.id, opp.id);
    await makeTenderSubmittable(h, tender.id);
    await awardTender(h, tender.id);
    const contract = (await h.contracts.list({ tenderId: tender.id }))[0];
    await h.contracts.changeStatus(contract.id, 'active');
    const project = (await h.projects.list({ contractId: contract.id }))[0];
    await h.projects.changeStatus(project.id, 'active'); // planned → active before it can complete

    // Complete the project → the growth loop fires: an EXPANSION signal on the project, AND (via the
    // deal-chain close project.completed → contract completed) a RENEWAL_DUE signal on the contract.
    await h.projects.changeStatus(project.id, 'completed');

    const bySource = (src: string) => h.createdSignals.filter((s: any) => s.source === src);
    expect(bySource('PROJECT_LIFECYCLE')).toHaveLength(1);
    expect(bySource('PROJECT_LIFECYCLE')[0].type).toBe('EXPANSION');
    expect(bySource('PROJECT_LIFECYCLE')[0].accountName).toBe('Nakheel PJSC');
    expect(bySource('PROJECT_LIFECYCLE')[0].dedupeKey).toBe(`growth-from-project:${project.id}`);
    expect(bySource('CONTRACT_LIFECYCLE')).toHaveLength(1);
    expect(bySource('CONTRACT_LIFECYCLE')[0].type).toBe('RENEWAL_DUE');

    // Re-delivery of the same project.completed event must not raise a second growth signal.
    await h.events.append([makeEvent({
      type: 'projects.project.completed', tenantId, companyId: null, actorId: null,
      aggregateType: 'projects.project', aggregateId: project.id,
      payload: { title: project.title, status: 'completed', contractId: contract.id, value: project.value },
    })]);
    expect(bySource('PROJECT_LIFECYCLE')).toHaveLength(1); // deduped on growth-from-project:<id>
  });

  it('auto-drafts a Variation from an approved cost-impacting design change (Engineering → Commercial)', async () => {
    const emit = (payload: Record<string, unknown>) =>
      h.events.append([
        makeEvent({
          type: 'engineering.design_change.approved',
          tenantId,
          companyId: null,
          actorId: 'u-eng',
          aggregateType: 'engineering.design_change',
          aggregateId: 'dc-1',
          payload,
        }),
      ]);

    // Approved + cost impact → one draft addition variation carrying the value.
    await emit({ triggersVariation: true, projectId: 'proj-9', projectName: 'Marina Tower',
      changeType: 'addition', estimatedValue: 12000, code: 'DC-1', title: 'Revised riser' });
    expect(h.createdVariations).toHaveLength(1);
    expect(h.createdVariations[0].type).toBe('addition');
    expect(h.createdVariations[0].amount).toBe(12000);
    expect(h.createdVariations[0].projectId).toBe('proj-9');

    // Re-delivery of the same event (aggregateId dc-1) must not duplicate.
    await emit({ triggersVariation: true, projectId: 'proj-9', projectName: 'Marina Tower',
      changeType: 'addition', estimatedValue: 12000, code: 'DC-1', title: 'Revised riser' });
    expect(h.createdVariations).toHaveLength(1);

    // A design change with no cost impact must not create anything.
    await h.events.append([
      makeEvent({ type: 'engineering.design_change.approved', tenantId, companyId: null, actorId: 'u-eng',
        aggregateType: 'engineering.design_change', aggregateId: 'dc-2',
        payload: { triggersVariation: false, projectId: 'proj-9', changeType: 'addition', estimatedValue: 0, code: 'DC-2' } }),
    ]);
    expect(h.createdVariations).toHaveLength(1);
  });

  it('routes a submitted HSE-owned engineering document into HSE as a risk assessment (Engineering → HSE, idempotent)', async () => {
    const submit = (aggregateId: string, payload: Record<string, unknown>) =>
      h.events.append([
        makeEvent({
          type: 'engineering.document.submitted',
          tenantId,
          companyId: null,
          actorId: 'u-eng',
          aggregateType: 'engineering.document',
          aggregateId,
          payload,
        }),
      ]);

    // Engineering originates, HSE owns → one HSE risk assessment lands in the queue.
    await submit('doc-1', { code: 'ED-100', docType: 'risk_assessment', ownerModule: 'hse', status: 'submitted', projectId: 'proj-9' });
    expect(h.createdRas).toHaveLength(1);
    expect(h.createdRas[0].reference).toBe('RA-ED-100');
    expect(h.createdRas[0].projectId).toBe('proj-9');

    // Re-delivery of the same submit must not duplicate (deterministic reference guard).
    await submit('doc-1', { code: 'ED-100', docType: 'risk_assessment', ownerModule: 'hse', status: 'submitted', projectId: 'proj-9' });
    expect(h.createdRas).toHaveLength(1);

    // An Engineering-owned docType (method statement) must NOT hand off to HSE.
    await submit('doc-2', { code: 'ED-101', docType: 'method_statement', ownerModule: 'engineering', status: 'submitted', projectId: 'proj-9' });
    expect(h.createdRas).toHaveLength(1);
  });

  it('creates only a root WBS when no immutable BOQ revision is present', async () => {
    // G5: value 0 was fine when nothing checked it; the win gate now refuses it (a win of 0 is not
    // a win). The BOQ/CBS assertions below are about the tender's items, not this figure.
    const opp = await h.opportunities.create({ tenantId, title: 'BOQ Job', value: 250_000 });
    // Start Tender from the opportunity.
    const tender = await h.tenders.create({ tenantId, title: 'Tender: BOQ Job', value: 250_000 });
    await h.tenders.linkOpportunity(tender.id, opp.id);

    // Give the tender a BOQ; this also recalculates its value.
    const { boq } = await h.tenders.getOrCreateBOQ(tenantId, null, tender.id);
    await h.tenders.addBOQItem(tenantId, null, boq.id, {
      itemCode: '1',
      description: 'Earthworks',
      unit: 'm3',
      quantity: 100,
      rate: 50,
    });

    await makeTenderSubmittable(h, tender.id);
    await awardTender(h, tender.id);
    const contract = (await h.contracts.list({ tenderId: tender.id }))[0];
    await h.contracts.changeStatus(contract.id, 'active');
    const project = (await h.projects.list({ contractId: contract.id }))[0];

    const wbsNodes = await h.wbs.list({ projectId: project.id });
    expect(wbsNodes.length).toBeGreaterThanOrEqual(1);
    expect(wbsNodes.some((n) => n.code === '1')).toBe(true);

    // Gate A: a live Tender BOQ is not a Project baseline. Until an immutable BOQ revision
    // snapshot is supplied, no CBS nodes are seeded from the mutable Tender aggregate.
    const cbsNodes = await h.cbs.list({ projectId: project.id });
    expect(cbsNodes).toHaveLength(0);

    // Re-signing must not double-seed the breakdown.
    await h.contracts.changeStatus(contract.id, 'active');
    expect((await h.wbs.list({ projectId: project.id })).filter((n) => n.code === '1')).toHaveLength(1);
  });

  it('does not double-bill an AR invoice when an IPC-certified event is re-delivered', async () => {
    const ipcEvent = makeEvent({
      type: 'contracts.ipc.certified',
      tenantId,
      companyId: null,
      actorId: null,
      aggregateType: 'contracts.ipc',
      aggregateId: 'ipc-1',
      payload: {
        account: { id: 'acct-1', name: 'Acme Developments LLC' },
        netThisCertificate: 250_000,
        reference: 'IPC-001',
        contractId: 'contract-abc-12345678',
      },
    });

    await h.bus.publish(ipcEvent);
    await h.bus.publish(ipcEvent); // re-delivery

    const invoices = await h.customerInvoices.list({ tenantId });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].customerName).toBe('Acme Developments LLC');
  });

  it('posts a balanced GL journal entry when an asset is disposed', async () => {
    const disposalEvent = makeEvent({
      type: 'assets.asset.disposed',
      tenantId,
      companyId: 'company-1',
      actorId: 'actor-1',
      aggregateType: 'assets.asset',
      aggregateId: 'asset-123',
      payload: {
        assetName: 'Laser Leveler',
        method: 'sell',
        proceeds: 1200,
        bookValue: 1000,
        gainLoss: 200,
      },
    });

    await h.bus.publish(disposalEvent);

    expect(h.postedJournals).toHaveLength(1);
    const j = h.postedJournals[0];
    expect(j.companyId).toBe('company-1');
    expect(j.reference).toBe('DISP-asset-12');
    expect(j.description).toContain('Laser Leveler');

    const fixedAssetLine = j.lines.find((l: any) => l.accountCode === '1500');
    const bankLine = j.lines.find((l: any) => l.accountCode === '1010');
    const gainLine = j.lines.find((l: any) => l.accountCode === '4920');

    expect(fixedAssetLine.credit).toBe(1000);
    expect(bankLine.debit).toBe(1200);
    expect(gainLine.credit).toBe(200);
  });

  it('posts a balanced GL journal entry with loss when an asset is disposed for less than book value', async () => {
    const disposalEvent = makeEvent({
      type: 'assets.asset.disposed',
      tenantId,
      companyId: 'company-1',
      actorId: 'actor-1',
      aggregateType: 'assets.asset',
      aggregateId: 'asset-456',
      payload: {
        assetName: 'Excavator Model S',
        method: 'scrap',
        proceeds: 500,
        bookValue: 800,
        gainLoss: -300,
      },
    });

    await h.bus.publish(disposalEvent);

    const j = h.postedJournals.find((j: any) => j.reference === 'DISP-asset-45');
    expect(j).toBeDefined();

    const fixedAssetLine = j!.lines.find((l: any) => l.accountCode === '1500');
    const bankLine = j!.lines.find((l: any) => l.accountCode === '1010');
    const lossLine = j!.lines.find((l: any) => l.accountCode === '5920');

    expect(fixedAssetLine.credit).toBe(800);
    expect(bankLine.debit).toBe(500);
    expect(lossLine.debit).toBe(300);
  });

  it('auto-drafts an AP invoice when a subcontract claim is certified', async () => {
    const claimEvent = makeEvent({
      type: 'subcontracts.claim.statusChanged',
      tenantId,
      companyId: 'company-1',
      actorId: 'certifier-1',
      aggregateType: 'subcontracts.claim',
      aggregateId: 'claim-001',
      payload: {
        status: 'certified',
        claimNumber: 1,
        netCertifiedValue: 45000,
        retentionWithheld: 5000,
        isRetentionRelease: false,
        retentionReleased: 0,
        subcontractId: 'sc-abc',
        subcontractor: 'Al Falah Steel Works',
        subcontractTitle: 'Structural Steel Package',
        projectId: 'proj-xyz',
        projectName: 'Marina Tower',
      },
    });

    await h.bus.publish(claimEvent);

    expect(h.createdApInvoices).toHaveLength(1);
    const inv = h.createdApInvoices[0];
    expect(inv.supplierName).toBe('Al Falah Steel Works');
    expect(inv.value).toBe(45000);
    expect(inv.projectId).toBe('proj-xyz');
    expect(inv.projectName).toBe('Marina Tower');
    expect(inv.title).toContain('Al Falah Steel Works');
    expect(inv.title).toContain('#1');
  });

  it('auto-drafts a replenishment PR when an issue crosses the reorder level', async () => {
    const movement = (quantity: number, balanceAfter: number) =>
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId,
        companyId: null,
        actorId: null,
        aggregateType: 'inventory.stock',
        aggregateId: 'item-cbl',
        payload: {
          direction: 'out',
          quantity,
          balanceAfter,
          reorderLevel: 50,
          reorderQty: 200,
          avgCost: 2.5,
          code: 'CBL-CAT6',
          name: 'Cat6 Cable',
          unit: 'box',
        },
      });

    // 60 → 40: crosses the level (50) → exactly one PR at reorderQty × WAC.
    await h.bus.publish(movement(20, 40));
    expect(h.createdPrs).toHaveLength(1);
    expect(h.createdPrs[0].reference).toBe('PR-RO-CBL-CAT6');
    expect(h.createdPrs[0].value).toBe(500); // 200 × 2.5
    expect(h.createdPrs[0].status).toBe('draft');

    // 40 → 30: already below the level → no second PR for the same dip.
    await h.bus.publish(movement(10, 30));
    expect(h.createdPrs).toHaveLength(1);
  });

  it('does not draft a PR for receipts or items without a reorder policy', async () => {
    await h.bus.publish(
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId, companyId: null, actorId: null,
        aggregateType: 'inventory.stock', aggregateId: 'item-x',
        payload: { direction: 'in', quantity: 10, balanceAfter: 5, reorderLevel: 50, code: 'X' },
      }),
    );
    await h.bus.publish(
      makeEvent({
        type: 'inventory.stock.movement_recorded',
        tenantId, companyId: null, actorId: null,
        aggregateType: 'inventory.stock', aggregateId: 'item-y',
        payload: { direction: 'out', quantity: 10, balanceAfter: 2, reorderLevel: 0, code: 'Y' },
      }),
    );
    expect(h.createdPrs).toHaveLength(0);
  });

  it('is idempotent: re-delivered claim.certified does not duplicate AP invoice', async () => {
    const claimEvent = makeEvent({
      type: 'subcontracts.claim.statusChanged',
      tenantId,
      companyId: null,
      actorId: null,
      aggregateType: 'subcontracts.claim',
      aggregateId: 'claim-idem',
      payload: {
        status: 'certified',
        claimNumber: 2,
        netCertifiedValue: 30000,
        subcontractId: 'sc-def',
        subcontractor: 'Gulf MEP Ltd',
      },
    });

    await h.bus.publish(claimEvent);
    await h.bus.publish(claimEvent); // re-delivery

    const matching = h.createdApInvoices.filter((i: any) => i.supplierName === 'Gulf MEP Ltd');
    expect(matching).toHaveLength(1);
  });
});
