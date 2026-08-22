import type { Id } from '@aura/shared';

export const CRM_PRE_AWARD_PACKAGE_STORE = Symbol('CRM_PRE_AWARD_PACKAGE_STORE');

/**
 * The governance facts a quotation gate needs about a deal's Pre-Award package: does a package back
 * this deal, and are its Scope / Estimate / Pricing revisions in a state that permits quoting. Derived
 * from the package's revisions (basis approved, estimate approved) + its pricing sheet (frozen) —
 * never stored, always read, so it can't drift from the revisions it summarises.
 */
export interface PreAwardGovernance {
  /** A Pre-Award package backs this deal (governance applies). False ⇒ legacy/grandfathered. */
  governed: boolean;
  packageId: Id | null;
  /** ∃ an APPROVED basis revision (the scope/BOQ projection was locked). */
  scopeApproved: boolean;
  /** ∃ an APPROVED estimate revision. */
  estimateApproved: boolean;
  /** ∃ a FROZEN pricing sheet (the pricing revision) for the package. */
  pricingFrozen: boolean;
}

/** Ungoverned default — the safe legacy answer when no package backs a deal. */
export const UNGOVERNED: PreAwardGovernance = {
  governed: false, packageId: null, scopeApproved: false, estimateApproved: false, pricingFrozen: false,
};

export interface PreAwardPackageStore {
  /** Governance facts for a DIRECT deal, keyed by its opportunity. Ungoverned when no package. */
  governanceForOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance>;
}
