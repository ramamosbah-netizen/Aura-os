import { type Id, newId, type CostComponent, type ResourceBreakdown } from '@aura/shared';
import type { PreAwardGovernance } from '../pre-award-package-store';

// Pre-Award Package — the write-model domain (Phase 3). A package is a real Pre-Award VERSION with a
// lifecycle; the Opportunity (direct) or Tender owns it via XOR. Estimation runs on immutable
// revisions: Scope/BOQ → BasisRevision (frozen projection) → EstimateRevision → build-ups → Pricing.
// These are pure factories + lifecycle transitions; stores/services/endpoints persist them.

export type PreAwardRoute = 'direct' | 'tender';
export type PackageStatus = 'open' | 'in_review' | 'issued' | 'closed';

export interface PreAwardPackage {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  opportunityId: Id | null;
  tenderId: Id | null;
  route: PreAwardRoute;
  status: PackageStatus;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

/** Owner is exactly one of opportunity (direct) | tender — enforced here, mirrored by the DB CHECK. */
export function makePreAwardPackage(input: {
  tenantId: Id;
  companyId?: Id | null;
  opportunityId?: Id | null;
  tenderId?: Id | null;
  createdBy?: Id | null;
}): PreAwardPackage {
  const hasOpp = !!input.opportunityId;
  const hasTender = !!input.tenderId;
  if (hasOpp === hasTender) throw new Error('a pre-award package must have exactly one owner — an opportunity OR a tender');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId ?? null,
    tenderId: input.tenderId ?? null,
    route: hasOpp ? 'direct' : 'tender',
    status: 'open',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Estimation Basis Revision — the frozen projection the estimator builds on ────────────────────
export type RevisionStatus = 'draft' | 'approved' | 'superseded';
export type BasisSourceKind = 'scope' | 'boq';

export interface BasisLine {
  lineId: Id;
  description: string;
  unit: string;
  quantity: number;
  /** The ScopeLine/BOQItem this line was projected from (provenance). */
  sourceLineId: Id;
}

export interface EstimationBasisRevision {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  packageId: Id;
  revisionNo: number;
  sourceKind: BasisSourceKind;
  sourceId: Id;
  sourceRevRef: string | null;
  status: RevisionStatus;
  lines: BasisLine[];
  createdBy: Id | null;
  createdAt: string;
  approvedBy: Id | null;
  approvedAt: string | null;
}

export function makeBasisRevision(input: {
  tenantId: Id; companyId?: Id | null; packageId: Id; revisionNo: number;
  sourceKind: BasisSourceKind; sourceId: Id; sourceRevRef?: string | null;
  lines: BasisLine[]; createdBy?: Id | null;
}): EstimationBasisRevision {
  if (!(input.revisionNo > 0)) throw new Error('revisionNo must be > 0');
  return {
    id: newId(), tenantId: input.tenantId, companyId: input.companyId ?? null, packageId: input.packageId,
    revisionNo: input.revisionNo, sourceKind: input.sourceKind, sourceId: input.sourceId,
    sourceRevRef: input.sourceRevRef ?? null, status: 'draft',
    // Frozen snapshot by value — later source edits cannot reach in and mutate it.
    lines: JSON.parse(JSON.stringify(input.lines)) as BasisLine[],
    createdBy: input.createdBy ?? null, createdAt: new Date().toISOString(), approvedBy: null, approvedAt: null,
  };
}

export function approveBasis(rev: EstimationBasisRevision, approvedBy: Id | null): EstimationBasisRevision {
  if (rev.status === 'superseded') throw new Error('cannot approve a superseded basis revision');
  return { ...rev, status: 'approved', approvedBy, approvedAt: new Date().toISOString() };
}

// ── Estimate Revision — immutable estimate on a specific basis (freeze-on-reference) ─────────────
export type EstimateStatus = 'draft' | 'frozen' | 'approved' | 'superseded';

export interface EstimateBuildUp {
  id: Id;
  basisLineId: Id;
  components: CostComponent[];
  resources: ResourceBreakdown | null;
  indirectPercent: number;
  overheadPercent: number;
  riskPercent: number;
  profitPercent: number;
  directCost: number;
  indirectAmount: number;
  overheadAmount: number;
  riskAmount: number;
  profitAmount: number;
  sellingRate: number;
  notes: string | null;
}

export interface EstimateRevision {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  packageId: Id;
  basisRevisionId: Id;
  revisionNo: number;
  status: EstimateStatus;
  totals: Record<string, unknown>;
  createdBy: Id | null;
  createdAt: string;
  frozenBy: Id | null;
  frozenAt: string | null;
  approvedBy: Id | null;
  approvedAt: string | null;
}

export function makeEstimateRevision(input: {
  tenantId: Id; companyId?: Id | null; packageId: Id; basisRevisionId: Id; revisionNo: number;
  totals: Record<string, unknown>; createdBy?: Id | null;
}): EstimateRevision {
  if (!(input.revisionNo > 0)) throw new Error('revisionNo must be > 0');
  return {
    id: newId(), tenantId: input.tenantId, companyId: input.companyId ?? null, packageId: input.packageId,
    basisRevisionId: input.basisRevisionId, revisionNo: input.revisionNo, status: 'draft',
    totals: input.totals, createdBy: input.createdBy ?? null, createdAt: new Date().toISOString(),
    frozenBy: null, frozenAt: null, approvedBy: null, approvedAt: null,
  };
}

/** Freeze-on-reference: a draft becomes immutable the moment it is referenced (sourcing/pricing/review). */
export function freezeEstimate(rev: EstimateRevision, frozenBy: Id | null): EstimateRevision {
  if (rev.status !== 'draft') throw new Error(`only a draft estimate can be frozen (is ${rev.status})`);
  return { ...rev, status: 'frozen', frozenBy, frozenAt: new Date().toISOString() };
}

export function approveEstimate(rev: EstimateRevision, approvedBy: Id | null): EstimateRevision {
  if (rev.status !== 'draft' && rev.status !== 'frozen') throw new Error(`only a draft/frozen estimate can be approved (is ${rev.status})`);
  const now = new Date().toISOString();
  return { ...rev, status: 'approved', frozenAt: rev.frozenAt ?? now, frozenBy: rev.frozenBy ?? approvedBy, approvedBy, approvedAt: now };
}

/** True while a revision may still be edited in place (only a draft). Once referenced/frozen it is
 *  immutable and a change must create the next revision. */
export const isEditable = (status: RevisionStatus | EstimateStatus): boolean => status === 'draft';

/**
 * Compute governance facts from a package's revisions + whether its pricing is frozen — the same
 * shape the postgres store derives in SQL, so in-memory and DB agree.
 */
export function packageGovernance(
  packageId: Id | null,
  basis: EstimationBasisRevision[],
  estimates: EstimateRevision[],
  pricingFrozen: boolean,
): PreAwardGovernance {
  if (!packageId) return { governed: false, packageId: null, scopeApproved: false, estimateApproved: false, pricingFrozen: false };
  return {
    governed: true,
    packageId,
    scopeApproved: basis.some((b) => b.status === 'approved'),
    estimateApproved: estimates.some((e) => e.status === 'approved'),
    pricingFrozen,
  };
}
