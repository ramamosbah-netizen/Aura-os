import type { Id } from '@aura/shared';
import type { PreAwardPackage, EstimationBasisRevision, EstimateRevision, EstimateBuildUp } from './domain/pre-award-package';

export const CRM_PRE_AWARD_PACKAGE_STORE = Symbol('CRM_PRE_AWARD_PACKAGE_STORE');

/**
 * The governance facts a quotation gate needs about a deal's Pre-Award package: does a package back
 * this deal, and are its Scope / Estimate / Pricing revisions in a state that permits quoting. Derived
 * from the package's revisions (basis approved, estimate approved) + its pricing sheet (frozen), so it
 * can't drift from the revisions it summarises.
 */
export interface PreAwardGovernance {
  governed: boolean;
  packageId: Id | null;
  scopeApproved: boolean;
  estimateApproved: boolean;
  pricingFrozen: boolean;
}

export const UNGOVERNED: PreAwardGovernance = {
  governed: false, packageId: null, scopeApproved: false, estimateApproved: false, pricingFrozen: false,
};

export interface PreAwardPackageStore {
  // ── writes ──
  savePackage(p: PreAwardPackage): Promise<void>;
  saveBasis(b: EstimationBasisRevision): Promise<void>;
  saveEstimate(e: EstimateRevision): Promise<void>;
  saveBuildUps(tenantId: Id, companyId: Id | null, estimateRevisionId: Id, buildUps: EstimateBuildUp[]): Promise<void>;
  /** Record that this package's pricing is frozen (in-memory tracks it; postgres derives from the
   *  pricing sheet's own status, so its impl is a no-op). */
  markPricingFrozen(tenantId: Id, packageId: Id, frozen: boolean): Promise<void>;

  // ── reads ──
  getByOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardPackage | null>;
  listBasis(tenantId: Id, packageId: Id): Promise<EstimationBasisRevision[]>;
  listEstimates(tenantId: Id, packageId: Id): Promise<EstimateRevision[]>;
  /** Governance facts for a DIRECT deal, keyed by its opportunity. Ungoverned when no package. */
  governanceForOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardGovernance>;
}
