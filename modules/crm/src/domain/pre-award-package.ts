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
  /**
   * The quantity — or NULL when the source does not state one. **Unknown is not zero.** A null is
   * carried honestly through the chain and BLOCKS approval, estimation and pricing (see
   * `basisCompleteness`) rather than silently costing the line at nothing. The type is nullable on
   * purpose: it makes "unknown" unrepresentable as a number, so no consumer can do arithmetic on it
   * without the compiler forcing a decision.
   */
  quantity: number | null;
  /** The ScopeLine/BOQItem this line was projected from (provenance). */
  sourceLineId: Id;
  /**
   * Stamped when a human edits a line on the draft. The provenance above is NEVER rewritten — an
   * edited line still points at the evidence it came from, it just stops claiming to be verbatim.
   */
  editedBy?: Id | null;
  editedAt?: string | null;
}

/**
 * Which lines still lack a quantity. The estimation chain multiplies by quantity, so an unknown one
 * cannot be priced — the gates below refuse to advance until every line carries a real number.
 */
export interface BasisCompleteness {
  complete: boolean;
  incompleteLineIds: Id[];
}

export function basisCompleteness(lines: BasisLine[]): BasisCompleteness {
  const incompleteLineIds = lines.filter((l) => l.quantity === null || l.quantity === undefined).map((l) => l.lineId);
  return { complete: incompleteLineIds.length === 0, incompleteLineIds };
}

/** Shared refusal so the approve / estimate / pricing gates all speak with one voice. */
export function assertBasisQuantitiesKnown(rev: EstimationBasisRevision, action: string): void {
  const gaps = basisCompleteness(rev.lines);
  if (!gaps.complete) {
    throw new Error(
      `cannot ${action}: ${gaps.incompleteLineIds.length} line(s) still have an unknown quantity — supply a quantity for every line first (unknown is not zero)`,
    );
  }
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

/**
 * Human edit of a DRAFT basis — the "editable scope draft" half of Accept ≠ Approve. Replaces the
 * line set (add / remove / change description, unit, quantity) while preserving each surviving line's
 * `sourceLineId`, so a human edit refines the evidence trail instead of erasing it. Only a draft can
 * be edited: once approved, the revision is the frozen thing the estimate was built on.
 */
export function updateBasisLines(rev: EstimationBasisRevision, lines: BasisLine[], editedBy: Id | null): EstimationBasisRevision {
  if (rev.status !== 'draft') {
    throw new Error(`only a draft basis revision can be edited — B-${String(rev.revisionNo).padStart(3, '0')} is already ${rev.status}`);
  }
  if (lines.length === 0) throw new Error('a basis revision needs at least one line');
  const priorById = new Map(rev.lines.map((l) => [l.lineId, l]));
  const now = new Date().toISOString();
  const next = lines.map((l) => {
    const prior = priorById.get(l.lineId);
    // Provenance is owned by the original projection, never by the editor's payload.
    const sourceLineId = prior ? prior.sourceLineId : l.sourceLineId;
    const changed =
      !prior || prior.description !== l.description || prior.unit !== l.unit || prior.quantity !== l.quantity;
    return {
      lineId: l.lineId,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      sourceLineId,
      editedBy: changed ? editedBy : (prior?.editedBy ?? null),
      editedAt: changed ? now : (prior?.editedAt ?? null),
    };
  });
  return { ...rev, lines: next };
}

export function approveBasis(rev: EstimationBasisRevision, approvedBy: Id | null): EstimationBasisRevision {
  if (rev.status === 'superseded') throw new Error('cannot approve a superseded basis revision');
  // An approval is an audit record, not a toggle: re-approving must never re-stamp who/when.
  if (rev.status === 'approved') {
    throw new Error(`only a draft basis revision can be approved — B-${String(rev.revisionNo).padStart(3, '0')} is already approved`);
  }
  assertBasisQuantitiesKnown(rev, 'approve this scope basis');
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
