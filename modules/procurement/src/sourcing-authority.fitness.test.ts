import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SourcingAwardService } from './sourcing-award.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';
import { makeSourcingRecommendation, type RecommendationSelection, type SourcingRecommendation } from './domain/sourcing-recommendation';

/**
 * ADR-0022 — the boundaries between recommending, approving, awarding and owning an order.
 *
 * All four acts work, and that is exactly when the lines need drawing: they sit within a few hundred
 * lines of each other, each producing what the next relies on, and every one is a plausible place to
 * do a little more than it should. The award could "just" fix a price. The recommendation could
 * "just" rank by total. An order could "just" be raised without a decision, because somebody is in a
 * hurry. Each is one commit away, and none looks wrong in the diff that introduces it.
 *
 * So each boundary the ADR draws fails here if it moves. Structural where the risk is an import or a
 * call appearing, behavioural where the risk is a rule quietly not running.
 */

const SRC = __dirname;

/** Source with comments stripped — a boundary explained in prose is not a boundary enforced. */
function sourceWithoutComments(file: string): string {
  return fs
    .readFileSync(path.join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('SUP-13 — what a recommendation may and may not do', () => {
  const src = () => sourceWithoutComments('sourcing-recommendation.service.ts');

  it('cannot create a purchase order — it does not know how to', () => {
    const s = src();
    expect(s, 'a recommendation that can raise an order is an award without an approver')
      .not.toContain('PurchaseOrderService');
    expect(s).not.toContain('PURCHASE_ORDER_STORE');
    expect(s).not.toContain('makePurchaseOrder');
  });

  it('names no winner and sorts nothing by price', () => {
    const s = src();
    // `lowestQuote` and its descendants. An ordering IS a recommendation under another name.
    for (const banned of ['lowestQuote', 'cheapest', '.sort(']) {
      expect(s, `${banned} would make AURA choose, which is the one thing it must not do`).not.toContain(banned);
    }
  });

  it('refuses a self-approval, a stale approval, and an amount beyond authority', () => {
    const s = src();
    expect(s).toContain('cannot approve it');
    expect(s).toContain('staleness.stale');
    // BOTH matrix checks: each supplier's award, and the decision as a whole. One without the other
    // is a limit that can be evaded by splitting a commitment into smaller pieces.
    expect(s.match(/assertApprovalAuthority/g) ?? []).toHaveLength(2);
    expect(s).toContain('sourcing decision in total');
  });

  it('never re-points a selection at a newer revision', () => {
    // A decision made on Rev 1 was a decision ABOUT Rev 1. The store offers no way to move it: a
    // newer revision makes the recommendation stale, which a person then acts on.
    const store = sourceWithoutComments('sourcing-recommendation.store.ts');
    expect(store).not.toMatch(/updateSelection|setRevision|repoint/i);
  });

  it('keeps the decision when a recommendation is withdrawn', () => {
    const s = src();
    const withdraw = s.slice(s.indexOf('async withdraw'), s.indexOf('listByRfq'));
    expect(withdraw, 'withdrawal must record its own act').toContain('withdrawnBy');
    // …and must NOT write into the fields that hold who approved it. It once did, which deleted the
    // approval from the only place it was kept.
    expect(withdraw, 'a withdrawal must not overwrite the approval').not.toMatch(/decidedBy\s*:/);
    expect(withdraw).not.toMatch(/decisionNote\s*:/);
  });
});

describe('SUP-14 — what an award may and may not do', () => {
  const src = () => sourceWithoutComments('sourcing-award.service.ts');

  it('computes no price: no FX, no conversion, no re-derivation', () => {
    const s = src();
    for (const banned of ['ExchangeRate', 'resolveGovernedRate', 'convert', 'baseCurrency', 'comparisonCurrency * ']) {
      expect(s, `an award that can ${banned} can redenominate a supplier's contract`).not.toContain(banned);
    }
    // The only money it writes comes from the offer, through one mapping of the offer line's own
    // facts — quantity, gross unit price, discount and the kind of discount it is.
    expect(s).toContain('unitPrice: l.unitPrice ?? 0');
    expect(s).toContain('asOrderValue(quoted)');
    expect(s).toContain('revision.currency');
  });

  it('makes no decision — it executes one', () => {
    const s = src();
    for (const banned of ['prepareDraft', 'offerRecommendability', 'makeSourcingRecommendation', 'assertApprovalAuthority']) {
      expect(s, `${banned} belongs to the decision, not to its execution`).not.toContain(banned);
    }
  });

  it('raises orders through the order service, not by writing rows', () => {
    const s = src();
    // `create` is what numbers an order, emits `po.created` so the commitment reaches project cost,
    // writes the audit entry and refuses an unapproved supplier.
    expect(s).toContain('this.orders.raise(tx,');
    expect(s).not.toContain('PURCHASE_ORDER_STORE');
  });

  it('cannot award the same recommendation twice, by three separate mechanisms', () => {
    const s = src();
    // 1. serialise: the lock is taken BEFORE anything is read, or it protects nothing.
    expect(s).toContain('acquireLock(tx, lockKey)');
    expect(s.indexOf('acquireLock')).toBeLessThan(s.indexOf('this.recommendations.get'));
    // 2. decide: a conditional claim, whose row count says who won — not a read-then-write.
    expect(s).toContain('claimForAward');
    expect(s).toContain('if (!claimed)');
    expect(s, 'an unconditional status write would make the claim decorative').not.toContain('updateStatus');
    // 3. make it impossible: the order carries the selection a unique index keys on (0358).
    expect(s).toContain('recommendationSelectionId: selection.id');
  });

  it('runs the whole award in ONE transaction, so there is no half-awarded state', () => {
    const s = src();
    expect(s).toContain('run.run(async (tx)');
    // Every write takes the transaction. A write that quietly did not would commit on its own.
    expect(s).toContain('this.orders.raise(tx,');
    expect(s).toContain('saveWithClient(tx,');
    expect(s).toContain('appendWithClient(tx,');
    expect(s).toContain('claimForAward(tenantId, recommendationId, actorId, tx)');
  });

  it('holds the revisions it checked, so staleness cannot change under it', () => {
    const s = src();
    expect(s, 'reading without holding leaves the window this closes')
      .toContain('findConfirmedRevisionForAward(tenantId, selection.offerId, tx)');
    expect(s).not.toContain('findConfirmedRevision(tenantId, selection.offerId)');
  });

  it('never touches an order after raising it', () => {
    const s = src();
    for (const banned of ['orders.update', 'changeStatus', 'submitForApproval', 'approve(']) {
      expect(s, `an order's lifecycle is the purchase order's own (ADR-0022)`).not.toContain(banned);
    }
  });

  /**
   * The behavioural half. A source scan cannot tell whether a guard RUNS, only that it is written —
   * so the refusals that make an award governed rather than mechanical are exercised against fakes.
   */
  describe('and what it refuses, exercised', () => {
    const recommendation = (over: Partial<SourcingRecommendation> = {}): SourcingRecommendation => ({
      ...makeSourcingRecommendation({
        tenantId: 't1', rfqId: 'rfq-1', comparisonDate: '2026-03-10', comparisonCurrency: 'AED',
        mode: 'single_supplier',
      }),
      ...over,
    });

    const selection = (over: Partial<RecommendationSelection> = {}): RecommendationSelection => ({
      id: 'sel-1', tenantId: 't1', recommendationId: 'rec-1', familyId: 'fam-1', offerId: 'off-1',
      revisionId: 'rev-1', supplierName: 'Alpha', coveredPrLineIds: ['pr-1'],
      governedTotal: 1_000, governedTotalBasis: 'ex-tax', technicalStatus: 'eligible',
      commercialStatus: 'live', createdAt: '2026-03-10T00:00:00.000Z', ...over,
    });

    const build = (r: SourcingRecommendation, current: { id: string } | null = { id: 'rev-1' }) => {
      const orders = { raise: vi.fn() };
      const service = new SourcingAwardService(
        { get: async () => r, listSelections: async () => [selection()], updateStatus: vi.fn() } as never,
        { get: async () => ({ id: 'rfq-1', tenantId: 't1', title: 'RFQ', prId: 'pr-req' }) } as never,
        { listForRequest: async () => [] } as never,
        { findConfirmedRevisionForAward: async () => current, getRevision: async () => null, getFamily: async () => null } as never,
        { listByRevision: async () => [] } as never,
        orders as never,
        { listForOrder: async () => [], save: vi.fn(), saveWithClient: vi.fn() } as never,
        null,
        // No transaction runner and no lock service: every refusal below must hold on its own,
        // before any of the concurrency machinery is reached.
        null,
        null,
        null,
      );
      return { service, orders };
    };

    it('refuses a recommendation nobody approved, before writing anything', async () => {
      const { service, orders } = build(recommendation({ status: 'draft' }));
      await expect(service.award('t1', 'rec-1', 'u1')).rejects.toThrow(/cannot be awarded/);
      expect(orders.raise, 'nothing may be written by a refused award').not.toHaveBeenCalled();
    });

    it('refuses one that has gone stale since approval', async () => {
      // The supplier confirmed a NEWER revision after the approval, so the terms nobody reviewed
      // would be the ones ordered on.
      const { service, orders } = build(recommendation({ status: 'approved' }), { id: 'rev-2' });
      await expect(service.award('t1', 'rec-1', 'u1')).rejects.toThrow(/out of date/);
      expect(orders.raise).not.toHaveBeenCalled();
    });

    it('refuses one that was already awarded, rather than raising a second order', async () => {
      const { service, orders } = build(recommendation({ status: 'awarded' }));
      await expect(service.award('t1', 'rec-1', 'u1')).rejects.toThrow(/cannot be awarded/);
      expect(orders.raise).not.toHaveBeenCalled();
    });
  });
});

describe('the four acts stay four', () => {
  it('keeps decision-making out of the award and order-raising out of the decision', () => {
    // Stated as one assertion because it is one property: neither service may grow the other's
    // authority. Each half is checked above; this is the sentence they add up to.
    expect(SourcingRecommendationService.prototype).not.toHaveProperty('award');
    expect(SourcingAwardService.prototype).not.toHaveProperty('decide');
    expect(SourcingAwardService.prototype).not.toHaveProperty('prepareDraft');
    // One public act. `awardWithin` is the body of it, running inside the transaction `award`
    // opens — not a second way in, and nothing else may appear beside them.
    expect(Object.getOwnPropertyNames(SourcingAwardService.prototype).filter((m) => m !== 'constructor'))
      .toEqual(['award', 'awardWithin']);
  });
});
