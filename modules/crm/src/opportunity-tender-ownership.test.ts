import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type AiService, type EventStore } from '@aura/core';
import { makeOpportunity } from '@aura/shared';
import { OpportunityService } from './opportunity.service';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';
import { quotationReadiness } from './domain/quotation-readiness';

/**
 * Phase 0 — Opportunity ⇄ Tender ownership. Proves the invariant at the SERVICE (not the dropdown):
 * once a tender owns a deal, the opportunity cannot run a parallel commercial lifecycle; only the
 * tender's award/loss reactor (systemOutcome) syncs the result. And a Direct-sale deal does NOT need
 * to be Won to raise a quotation (that gate was backwards).
 */
function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const access = { assert: vi.fn(), can: () => ({ allowed: true, reason: 'ok' }) } as unknown as AccessService;
  const ai = {} as unknown as AiService;
  const store = new InMemoryOpportunityStore();
  const svc = new OpportunityService(store, events, new NullTxRunner(), access, ai);
  return { svc, store };
}

// Evidence that satisfies the generic stage gate, so a REJECTION can only be the ownership guard.
const FULL_EVIDENCE = { hasStakeholder: true, hasQuotation: true, quotationSubmitted: true };

describe('tender ownership — the opportunity cannot run a parallel lifecycle', () => {
  it('markTenderOwned stamps the deal and forces the tender route', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV', executionType: 'tender', value: 100000, needConfirmed: true });
    await store.create(opp);
    const owned = await svc.markTenderOwned(opp.id, 'tnd-1');
    expect(owned.tenderId).toBe('tnd-1');
    expect(owned.executionType).toBe('tender');
  });

  it('rejects manual proposal / negotiation / won / lost once a tender owns the deal', async () => {
    const stages: Array<'proposal' | 'negotiation' | 'won' | 'lost'> = ['proposal', 'negotiation', 'won', 'lost'];
    for (const to of stages) {
      const { svc, store } = harness();
      const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV', executionType: 'tender', value: 100000, needConfirmed: true });
      await store.create(opp);
      await svc.markTenderOwned(opp.id, 'tnd-1');
      await expect(
        svc.update(opp.id, { stage: to, winReason: 'x', lossReason: 'x' }, 'u1', FULL_EVIDENCE),
      ).rejects.toThrow(/only the linked tender can move this deal/i);
    }
  });

  it('rejects leaving the tender route while a tender owns the deal', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV', executionType: 'tender', value: 100000 });
    await store.create(opp);
    await svc.markTenderOwned(opp.id, 'tnd-1');
    await expect(svc.update(opp.id, { executionType: 'direct_sale' }, 'u1')).rejects.toThrow(/leave the tender route/i);
  });

  it('applyTenderOutcome (the sole outcome writer) CAN close the deal, and is idempotent', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV', executionType: 'tender', value: 0 });
    await store.create(opp);
    await svc.markTenderOwned(opp.id, 'tnd-1');
    const won = await svc.applyTenderOutcome(opp.id, 'won', { reason: 'Won on tender TND-1', value: 90000 });
    expect(won.stage).toBe('won');
    expect(won.value).toBe(90000); // carried the tender's value since the deal had none
    expect((await store.get(opp.id))?.stage).toBe('won');
    // idempotent — a redelivery does not reopen or change a closed deal
    const again = await svc.applyTenderOutcome(opp.id, 'lost', { reason: 'dup' });
    expect(again.stage).toBe('won');
  });

  it('a NON-owned opportunity is unaffected — normal transitions still work', async () => {
    const { svc, store } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'CCTV', executionType: 'direct_sale', value: 100000, needConfirmed: true });
    await store.create(opp);
    const moved = await svc.update(opp.id, { stage: 'proposal' }, 'u1', FULL_EVIDENCE);
    expect(moved.stage).toBe('proposal');
  });
});

describe('quotation readiness — a Direct deal does NOT need Won; a Tender deal is quoted via its tender', () => {
  it('direct + open (qualification) is ready — Won is NOT required', () => {
    const r = quotationReadiness({ stage: 'qualification', executionType: 'direct_sale', tenderId: null });
    expect(r.ready).toBe(true);
  });
  it('tender-route is NOT ready (quote through the tender)', () => {
    expect(quotationReadiness({ stage: 'proposal', executionType: 'tender', tenderId: null }).ready).toBe(false);
    expect(quotationReadiness({ stage: 'proposal', executionType: 'direct_sale', tenderId: 'tnd-1' }).ready).toBe(false);
  });
  it('a lost deal is NOT ready', () => {
    expect(quotationReadiness({ stage: 'lost', executionType: 'direct_sale', tenderId: null }).ready).toBe(false);
  });
});

describe('quotation readiness — Phase 2 evidence chain (governed only; legacy grandfathered)', () => {
  const direct = { stage: 'proposal' as const, executionType: 'direct_sale' as const, tenderId: null };

  it('UNGOVERNED (legacy) deal is ready on ownership rules alone — chain NOT required', () => {
    expect(quotationReadiness(direct, {}).ready).toBe(true);
    expect(quotationReadiness(direct, { governed: false, scopeApproved: false }).ready).toBe(true);
  });

  it('GOVERNED deal requires approved scope + approved estimate + frozen pricing', () => {
    const r = quotationReadiness(direct, { governed: true });
    expect(r.ready).toBe(false);
    expect(r.gaps.map((g) => g.code).sort()).toEqual(['ESTIMATE_NOT_APPROVED', 'PRICING_NOT_FROZEN', 'SCOPE_NOT_APPROVED']);
  });

  it('GOVERNED deal with the full chain is ready', () => {
    expect(quotationReadiness(direct, { governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true }).ready).toBe(true);
  });

  it('GOVERNED deal missing just one link is not ready', () => {
    const r = quotationReadiness(direct, { governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: false });
    expect(r.ready).toBe(false);
    expect(r.gaps.map((g) => g.code)).toEqual(['PRICING_NOT_FROZEN']);
  });

  it('ownership still wins even when governed+complete (tender-route never direct-quotes)', () => {
    const r = quotationReadiness({ stage: 'proposal', executionType: 'tender', tenderId: 'tnd-1' }, { governed: true, scopeApproved: true, estimateApproved: true, pricingFrozen: true });
    expect(r.ready).toBe(false);
    expect(r.gaps.map((g) => g.code)).toContain('TENDER_OWNED');
  });
});
