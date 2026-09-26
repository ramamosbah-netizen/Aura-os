import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PreAwardPackage, EstimationBasisRevision, EstimateRevision, EstimateBuildUp } from './domain/pre-award-package';
import type { TechnicalStudyRevision } from './domain/technical-study';

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

/**
 * A study revision that is waiting on one person, with the record it belongs to: the reviewer it
 * was submitted to, or the author it was returned to. The package's opportunity or tender is what
 * a work list links to — the study has no page of its own.
 */
export interface StudyAwaitingWork {
  study: TechnicalStudyRevision;
  opportunityId: Id | null;
  tenderId: Id | null;
}

export interface PreAwardPackageStore {
  // ── writes ──
  savePackage(p: PreAwardPackage): Promise<void>;
  saveStudy(s: TechnicalStudyRevision): Promise<void>;
  saveStudyWithClient(tx: TxHandle | null, s: TechnicalStudyRevision): Promise<void>;
  saveBasis(b: EstimationBasisRevision): Promise<void>;
  saveEstimate(e: EstimateRevision): Promise<void>;
  saveBuildUps(tenantId: Id, companyId: Id | null, estimateRevisionId: Id, buildUps: EstimateBuildUp[]): Promise<void>;

  // ── reads (governance is composed by PreAwardPackageService from these + the pricing store, so
  //    pricingFrozen always reflects a real frozen pricing sheet, never a toggle) ──
  getByOpportunity(tenantId: Id, opportunityId: Id): Promise<PreAwardPackage | null>;
  getByTender(tenantId: Id, tenderId: Id): Promise<PreAwardPackage | null>;
  listStudies(tenantId: Id, packageId: Id): Promise<TechnicalStudyRevision[]>;
  /** Revisions in review with `userId` as reviewer, and revisions returned to `userId` as author. */
  listStudiesAwaiting(tenantId: Id, userId: Id): Promise<StudyAwaitingWork[]>;
  listBasis(tenantId: Id, packageId: Id): Promise<EstimationBasisRevision[]>;
  listEstimates(tenantId: Id, packageId: Id): Promise<EstimateRevision[]>;
  /** The per-line build-ups of one estimate revision — the material/labour/plant detail. */
  listBuildUps(tenantId: Id, estimateRevisionId: Id): Promise<EstimateBuildUp[]>;
}
