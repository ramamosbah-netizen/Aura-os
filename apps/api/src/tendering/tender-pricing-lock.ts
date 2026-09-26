import { ConflictException, Injectable } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { QuotationService, isQuotationCommitted, type Quotation } from '@aura/crm';

/** What the lock reads of each quotation a tender generated — narrow, so the rule is testable alone. */
export type GeneratedOffer = Pick<Quotation, 'quoteNumber' | 'revision' | 'status'>;

/**
 * THE TENDER PRICING LOCK — the one rule every route that re-works a tender's costing obeys.
 *
 * This estimate is the costing that justifies the quotation generated from it. Once that quotation is
 * a live commitment to the client (approved onwards, mirroring the quotation sheet's own lock), the
 * costing behind it is FROZEN: re-working it would rewrite the justification for a price we are
 * already standing behind. Re-price the sanctioned way — raise a quotation revision, which starts as
 * a draft. Dead quotes (rejected/expired/cancelled) and superseded ones (`revised`) hold no live
 * commitment, so the estimate stays open for the next bid.
 *
 * UNDER REVIEW IS ALREADY TOO LATE TO RE-PRICE. The committed lock starts at `approved`, which left
 * the review window open: an approver could be looking at a set of figures while the estimator
 * reworked the costing underneath them, and the offer they signed would rest on a build-up nobody
 * reviewed. Measured before this rule existed — with the offer sitting in `internal_review`,
 * re-pricing a line was accepted and the tender's selling value moved from 179,821.20 to
 * 2,279,774.40 while the offer kept its own snapshot at 117,804.00. Asking for a decision is what
 * seals the costing: EST-17 requires approvers to "review the same frozen build-up".
 *
 * ONE RULE, NOT TWO. It used to live privately in the pricing-sheet controller, and the legacy
 * `POST /tendering/estimates` route carried its own copy of only the committed half — so the review
 * window stayed open there. Both now call this.
 *
 * It lives here in the composition layer, not in @aura/tendering: tendering must not depend on CRM
 * (ADR-0011) — the same seam R5 uses to keep it decoupled from procurement.
 *
 * Returns the refusal in words, or null when the costing may be re-worked.
 */
export function tenderPricingLockRefusal(generated: readonly GeneratedOffer[]): string | null {
  const underReview = generated.filter((q) => q.status === 'internal_review');
  if (underReview.length > 0) {
    const which = underReview.map((q) => `${q.quoteNumber} Rev ${q.revision}`).join(', ');
    return (
      `tender pricing sheet is locked: ${which} ${underReview.length === 1 ? 'is' : 'are'} with a ` +
      `commercial reviewer, and the costing behind figures somebody is deciding on cannot be ` +
      `re-worked while they decide. To change it, have the reviewer return the offer for revision.`
    );
  }

  const committed = generated.filter((q) => isQuotationCommitted(q));
  if (committed.length === 0) return null;
  const which = committed.map((q) => `${q.quoteNumber} Rev ${q.revision} (${q.status.replace('_', ' ')})`).join(', ');
  // A revision is only legal from sent/under_negotiation (and the dead states) — never from
  // `accepted`, where the price is already the basis of a contract. Point each case at the route
  // that actually exists rather than at advice that would 400.
  const onlyAccepted = committed.every((q) => q.status === 'accepted');
  const route = onlyAccepted
    ? 'an accepted price is the basis of the contract — change it through a contract variation'
    : 'raise a quotation revision to re-price';
  return (
    `tender pricing sheet is locked: ${which} ${committed.length === 1 ? 'was' : 'were'} generated from this ` +
    `estimate and ${committed.length === 1 ? 'is' : 'are'} committed to the client — the costing behind a ` +
    `committed price is immutable. To change it, ${route}.`
  );
}

@Injectable()
export class TenderPricingLock {
  constructor(
    private readonly quotations: QuotationService,
    private readonly tenant: TenantContext,
  ) {}

  /** Refuse (409) any re-working of this tender's costing while the lock holds. */
  async assertOpen(tenderId: string): Promise<void> {
    const refusal = tenderPricingLockRefusal(await this.quotations.listBySourceTender(this.tenant.get().tenantId, tenderId));
    if (refusal) throw new ConflictException(refusal);
  }
}
