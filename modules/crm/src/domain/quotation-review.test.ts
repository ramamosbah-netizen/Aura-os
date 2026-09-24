import { describe, expect, it } from 'vitest';
import { PRICING_EDITABLE_STATUSES, applyQuotationAction, isPricingLocked, type Quotation } from './quotation';
import { makeQuotationReviewDecision } from './quotation-review';

/**
 * STEP 4 — THE REVISION UNDER REVIEW IS FROZEN, AND A REVIEW HAS TWO OUTCOMES.
 *
 * Submitting an offer for review used to leave its costing editable, so an approver could be
 * deciding on figures while the estimator reworked the build-up underneath them. EST-17 asks that
 * approvers "review the same frozen build-up"; that sentence was not true.
 *
 * And freezing alone would have stranded corrections: `internal_review` could only go forward to
 * `approved`, so an offer a reviewer wanted changed had to be cancelled outright.
 */

const quote = (status: Quotation['status']): Pick<Quotation, 'status'> => ({ status });

describe('the build-up freezes when a decision is asked for', () => {
  it('is editable in draft and nowhere else', () => {
    expect(PRICING_EDITABLE_STATUSES).toEqual(['draft']);
    expect(isPricingLocked(quote('draft'))).toBe(false);
  });

  it('locks the moment the offer goes to a reviewer', () => {
    // The window this step exists to close. `internal_review` was editable.
    expect(isPricingLocked(quote('internal_review'))).toBe(true);
  });

  it('stays locked once approved and through every committed state', () => {
    for (const s of ['approved', 'sent', 'under_negotiation', 'accepted'] as const) {
      expect(isPricingLocked(quote(s)), s).toBe(true);
    }
  });

  it('stays locked on superseded and dead records, which are history', () => {
    for (const s of ['revised', 'rejected', 'expired', 'cancelled'] as const) {
      expect(isPricingLocked(quote(s)), s).toBe(true);
    }
  });
});

describe('a review has a second outcome', () => {
  it('returns a submitted offer to draft, where it can be re-priced', () => {
    const returned = applyQuotationAction({ status: 'internal_review' } as Quotation, 'return_for_revision');
    expect(returned.status).toBe('draft');
    expect(isPricingLocked(returned)).toBe(false);
  });

  it('refuses to return anything that is not with a reviewer', () => {
    // A draft is already editable, and an approved offer is a commitment — reopening it is a
    // revision, not a send-back.
    for (const s of ['draft', 'approved', 'sent', 'accepted'] as const) {
      expect(() => applyQuotationAction({ status: s } as Quotation, 'return_for_revision'), s)
        .toThrow(/cannot return for revision from status/i);
    }
  });
});

describe('what a send-back has to record', () => {
  const base = { tenantId: 't1', quotationId: 'q1', quoteNumber: 'QUO-1', revision: 2, decidedBy: 'u-approver' };

  it('keeps who returned it, at which revision, and why', () => {
    const d = makeQuotationReviewDecision({ ...base, reason: 'Labour rate is below the agreed schedule' });
    expect(d.decidedBy).toBe('u-approver');
    expect(d.revision).toBe(2);
    expect(d.outcome).toBe('returned');
    expect(d.reason).toContain('Labour rate');
    expect(d.decidedAt).toBeTruthy();
  });

  it('refuses a send-back with no reason', () => {
    // An offer back in draft with nothing said about it tells the estimator nothing. That is not
    // a review decision; it is an obstruction.
    expect(() => makeQuotationReviewDecision({ ...base, reason: '   ' }))
      .toThrow(/requires a reason/i);
  });

  it('records the revision it was about, so a resubmission is a different decision', () => {
    // An offer returned, re-priced and returned again carries two decisions against two revisions.
    // Collapsing them would hide that the estimator was sent back twice.
    const first = makeQuotationReviewDecision({ ...base, revision: 0, reason: 'first' });
    const second = makeQuotationReviewDecision({ ...base, revision: 1, reason: 'second' });
    expect(first.revision).toBe(0);
    expect(second.revision).toBe(1);
    expect(first.id).not.toBe(second.id);
  });
});
