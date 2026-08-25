import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore, NullTxRunner, AccessService, TenantContext } from '@aura/core';
import { makeEvent } from '@aura/shared';
import {
  OpportunityService, InMemoryOpportunityStore,
  QuotationService, InMemoryQuotationStore, InMemoryCommercialBaselineStore,
  PreAwardPackageService, InMemoryPreAwardPackageStore,
  PricingQuotationService, InMemoryPricingSheetStore,
  openCommercialPricing, applyPricingPolicy, QUOTATION_EVENT, type PricingSheet,
} from '@aura/crm';
import { makeOpportunity, type Opportunity } from '@aura/shared';
import { CrossModuleSubscriber } from './cross-module-subscriber';

// Slice 9 PR-1 — the accept→Won reactor, end-to-end through the bus with REAL CRM services.
// Proves: accepted authoritative quotation → Won; value from the baseline, never opportunity.value;
// awardedQuotationId is the exact accepted revision; idempotent replay; superseded/non-authoritative
// quote cannot close; tender-owned untouched. (Atomicity + fresh-connection persistence: pg-int test.)

const TENANT = 't1';
const flush = () => new Promise((r) => setTimeout(r, 0));
const aiStub = { complete: async () => ({ text: '' }) } as never;
const noop = {} as never;

function harness() {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const tx = new NullTxRunner();
  const access = new AccessService();
  const tenant = new TenantContext();

  const oppStore = new InMemoryOpportunityStore();
  const quoteStore = new InMemoryQuotationStore();
  const pricingStore = new InMemoryPricingSheetStore();
  const pkgStore = new InMemoryPreAwardPackageStore();

  const opportunities = new OpportunityService(oppStore, events, tx, access, aiStub, { classify: async () => 'direct_legacy' as const });
  const quotations = new QuotationService(quoteStore, new InMemoryCommercialBaselineStore(), events, access);
  const packages = new PreAwardPackageService(pkgStore, pricingStore);
  const materialiser = new PricingQuotationService(pricingStore, quoteStore, events, packages);

  // Only bus/tenant/opportunities/quotations/preAwardPackages matter for the accept reactor; the rest
  // are noops — onModuleInit only registers bus subscriptions, it never calls a service.
  const subscriber = new CrossModuleSubscriber(
    bus, noop, noop, noop, noop, noop, noop, noop, tenant, noop, noop, noop, noop, noop,
    opportunities, noop, quotations, packages, noop, noop, noop, noop, noop,
  );
  subscriber.onModuleInit();
  return { bus, events, oppStore, quoteStore, pricingStore, opportunities, quotations, packages, materialiser };
}

type H = ReturnType<typeof harness>;

async function seedOpp(h: H, over: Partial<Opportunity> = {}): Promise<string> {
  const opp: Opportunity = { ...makeOpportunity({ tenantId: TENANT, title: 'ELV deal', value: 999, executionType: 'direct_sale' }), ...over };
  await h.oppStore.create(opp);
  return opp.id;
}

/** Build a governed deal to a FROZEN pricing sheet, then materialise → approve (locks baseline) → send. */
async function toSentQuotation(h: H, oppId: string): Promise<{ quoteId: string; sheet: PricingSheet }> {
  const pkg = await h.packages.openDirect({ tenantId: TENANT, opportunityId: oppId });
  const draft = openCommercialPricing({ tenantId: TENANT, name: 'P', opportunityId: oppId, packageId: pkg.id, estimateRevisionId: 'e1', baselineCost: 1000, version: 1, parentSheetId: null, createdBy: 'u1' });
  await h.pricingStore.save(applyPricingPolicy(draft, { method: 'markup', percent: 20 }, null));
  const sheet = await h.packages.freezePricingSheetById({ tenantId: TENANT, opportunityId: oppId, sheetId: draft.id, actorId: 'u1' });
  const q = await h.materialiser.materialise({ tenantId: TENANT, opportunityId: oppId, customerName: 'Emaar', actorId: 'u1' });
  await h.quotations.changeStatus(q.id, 'approve', null); // locks the Commercial Baseline
  await h.quotations.changeStatus(q.id, 'send', null);
  return { quoteId: q.id, sheet };
}

describe('Slice 9 — quotation.accepted → Opportunity Won', () => {
  let h: H;
  beforeEach(() => { h = harness(); });

  it('accepting the authoritative quotation closes the deal Won with baseline value + provenance', async () => {
    const oppId = await seedOpp(h);
    const { quoteId, sheet } = await toSentQuotation(h, oppId);
    await h.quotations.changeStatus(quoteId, 'accept', null);
    await flush();

    const opp = await h.oppStore.get(oppId);
    expect(opp!.stage).toBe('won');
    expect(opp!.awardedQuotationId).toBe(quoteId);          // the exact accepted revision
    expect(opp!.awardSource).toBe('quotation_accepted');
    expect(opp!.contractedValue).toBe(sheet.totals.totalSell); // = baseline subtotal, NOT value (999)
    expect(opp!.value).toBe(999);                            // headline untouched
  });

  it('replaying the same acceptance is a no-op (idempotent by identity)', async () => {
    const oppId = await seedOpp(h);
    const { quoteId } = await toSentQuotation(h, oppId);
    await h.quotations.changeStatus(quoteId, 'accept', null);
    await flush();
    const first = await h.oppStore.get(oppId);
    // re-deliver the same accepted event
    await h.events.append([makeEvent({ type: QUOTATION_EVENT.accepted, tenantId: TENANT, companyId: null, actorId: null, aggregateType: 'crm.quotation', aggregateId: quoteId, payload: {} })]);
    await flush();
    expect(await h.oppStore.get(oppId)).toEqual(first); // unchanged
  });

  it('a tender-owned deal is never closed by a quotation acceptance', async () => {
    const oppId = await seedOpp(h, { tenderId: 'tender-1', executionType: 'tender', requiresTender: true });
    // craft a sent quote pointing at the opp (tender deals normally quote via the tender, but prove the guard)
    const { quoteId } = await toSentQuotation(h, oppId);
    await h.quotations.changeStatus(quoteId, 'accept', null);
    await flush();
    expect((await h.oppStore.get(oppId))!.stage).not.toBe('won');
  });

  it('a non-authoritative (not the current frozen sheet) accepted quote does NOT close Won', async () => {
    const oppId = await seedOpp(h);
    await toSentQuotation(h, oppId); // establishes the current frozen sheet → its quote is authoritative
    // A stray quote for the same opp that the current pricing does NOT point to.
    const stray = await h.quotations.create({ tenantId: TENANT, quoteNumber: 'QT-STRAY', customerName: 'Emaar', sourceOpportunityId: oppId, issueDate: '2026-08-24', lines: [{ description: 'x', quantity: 1, unitPrice: 500, vatRate: 5 }] });
    await h.events.append([makeEvent({ type: QUOTATION_EVENT.accepted, tenantId: TENANT, companyId: null, actorId: null, aggregateType: 'crm.quotation', aggregateId: stray.id, payload: {} })]);
    await flush();
    // stray isn't 'accepted' AND isn't the current pricing's quote — either guard refuses; deal stays open
    expect((await h.oppStore.get(oppId))!.stage).not.toBe('won');
  });
});
