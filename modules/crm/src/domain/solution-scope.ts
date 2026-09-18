import { type Id, newId, moneyNumber as round2 } from '@aura/shared';

// Pre-award discovery (R4) — the structured front-half the audit found missing. Two opportunity-scoped
// artifacts turn a deal from tribal-knowledge + spreadsheets into a priceable scope:
//   * Requirement    — WHAT the customer needs (captured, prioritised);
//   * SolutionScope   — the proposed solution as structured scope LINES (discipline, qty, unit, price).
// An APPROVED SolutionScope is the priceable baseline for the direct-sale path: it generates a
// Quotation (which then runs the R3 governance gate), so a quote is no longer free-form. Framework-free
// and deterministic so API, UI and tests share one rule set.

// ─────────────────────────── Requirement ───────────────────────────

export type RequirementPriority = 'must' | 'should' | 'could';
export type RequirementStatus = 'open' | 'met' | 'dropped';

export interface Requirement {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  title: string;
  detail: string | null;
  priority: RequirementPriority;
  status: RequirementStatus;
  /** Who recorded this need. A requirement is somebody's account of what the customer asked for. */
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewRequirement {
  tenantId: Id;
  opportunityId: Id;
  title: string;
  detail?: string | null;
  priority?: RequirementPriority;
  createdBy?: Id | null;
}

export function makeRequirement(input: NewRequirement): Requirement {
  if (!input.title?.trim()) throw new Error('requirement title is required');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    opportunityId: input.opportunityId,
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    priority: input.priority ?? 'should',
    status: 'open',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ─────────────────────────── Solution Scope ───────────────────────────

export type ScopeStatus = 'draft' | 'approved';

export interface ScopeLine {
  id: Id;
  /** ELV/MEP discipline (CCTV, Access Control, Fire Alarm, Structured Cabling, BMS, …). */
  discipline: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface NewScopeLine {
  discipline?: string | null;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice?: number;
}

export interface SolutionScope {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  title: string;
  status: ScopeStatus;
  lines: ScopeLine[];
  /** Sum of line totals — the scope's priceable value. */
  total: number;
  /**
   * WHO WROTE IT (J1-07). `approvedBy` existed and this did not, which is why the maker/checker rule
   * could not be written against this record at all: a scope that cannot say who authored it cannot
   * refuse that person's approval. NULL on rows written before authorship was recorded.
   */
  createdBy: Id | null;
  approvedBy: Id | null;
  approvedAt: string | null;
  /**
   * Whether the author/approver separation was actually CHECKED when this was approved.
   *
   * `enforced`      the approver was compared against a known author and differs.
   * `unverifiable`  the scope predates authorship being recorded, so the check could not run.
   * `null`          never approved.
   *
   * It exists because the alternative to recording it is worse in both directions: refusing every
   * legacy scope blocks real work for a fact nobody wrote down at the time, and approving them
   * quietly lets a self-approval through while the screen implies a control that did not run.
   */
  separationOfDuties: 'enforced' | 'unverifiable' | null;
  /** The quotation generated from this approved scope (reference, set on generate). */
  generatedQuotationId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSolutionScope {
  tenantId: Id;
  opportunityId: Id;
  title: string;
  /** Who is authoring it. Recorded so the approval can be refused to them later. */
  createdBy?: Id | null;
  lines?: NewScopeLine[];
}


export function makeScopeLine(input: NewScopeLine): ScopeLine {
  const quantity = Number(input.quantity);
  const unitPrice = Number(input.unitPrice ?? 0);
  if (!input.description?.trim()) throw new Error('scope line description is required');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('scope line quantity must be positive');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('scope line unit price cannot be negative');
  return {
    id: newId(),
    discipline: input.discipline?.trim() || null,
    description: input.description.trim(),
    unit: input.unit?.trim() || 'lot',
    quantity,
    unitPrice,
    lineTotal: round2(quantity * unitPrice),
  };
}

export function computeScopeTotal(lines: ScopeLine[]): number {
  return round2(lines.reduce((s, l) => s + l.lineTotal, 0));
}

export function makeSolutionScope(input: NewSolutionScope): SolutionScope {
  if (!input.title?.trim()) throw new Error('scope title is required');
  const now = new Date().toISOString();
  const lines = (input.lines ?? []).map(makeScopeLine);
  return {
    id: newId(),
    tenantId: input.tenantId,
    opportunityId: input.opportunityId,
    title: input.title.trim(),
    status: 'draft',
    lines,
    total: computeScopeTotal(lines),
    createdBy: input.createdBy ?? null,
    approvedBy: null,
    approvedAt: null,
    separationOfDuties: null,
    generatedQuotationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * SIGN-OFF, AND THE ONE RULE THAT MAKES IT A REVIEW (J1-07).
 *
 * "Study review and sign-off" is not a status change; it is one person accepting another person's
 * work. Until now the same actor could author a scope, approve it, and turn it into a customer
 * quotation — the approval recorded, truthfully, that they had approved themselves.
 *
 * THE AUTHOR MAY NOT APPROVE THEIR OWN SCOPE. Where the author is unknown — a scope written before
 * authorship was recorded — the approval proceeds and says so rather than pretending the check ran.
 * That keeps the exception visible and finite: every scope written from now on has an author.
 */
export function approveScope(scope: SolutionScope, approvedBy: Id | null): SolutionScope {
  if (scope.status === 'approved') throw new Error('scope is already approved');
  if (scope.lines.length === 0) throw new Error('cannot approve a scope with no lines');
  if (approvedBy && scope.createdBy && approvedBy === scope.createdBy) {
    throw new Error(
      // Phrased to the SHARED maker/checker shape ("may not … their own"), which the error taxonomy
      // classifies 403: the request is well formed and the record is in the right state — the ACTOR is
      // what is wrong, and a different person can do it right now with no change to anything.
      'the author of this scope may not approve their own work — sign-off means a second person',
    );
  }
  const now = new Date().toISOString();
  return {
    ...scope,
    status: 'approved',
    approvedBy,
    approvedAt: now,
    // Which of the two it was, recorded on the row rather than inferred later from a NULL author.
    separationOfDuties: scope.createdBy ? 'enforced' : 'unverifiable',
    updatedAt: now,
  };
}

/** Map an approved scope's lines to quotation lines (the direct-sale bridge into R3). */
export function scopeLinesToQuotationLines(scope: SolutionScope): Array<{ description: string; quantity: number; unit?: string | null; unitPrice: number }> {
  return scope.lines.map((l) => ({
    description: l.discipline ? `${l.discipline}: ${l.description}` : l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
  }));
}

export const PREAWARD_EVENT = {
  requirementAdded: 'crm.requirement.added',
  scopeCreated: 'crm.solution_scope.created',
  scopeApproved: 'crm.solution_scope.approved',
  scopeQuoted: 'crm.solution_scope.quoted',
} as const;
