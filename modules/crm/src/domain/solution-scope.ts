import { type Id, newId } from '@aura/shared';

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
  createdAt: string;
  updatedAt: string;
}

export interface NewRequirement {
  tenantId: Id;
  opportunityId: Id;
  title: string;
  detail?: string | null;
  priority?: RequirementPriority;
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
  approvedBy: Id | null;
  approvedAt: string | null;
  /** The quotation generated from this approved scope (reference, set on generate). */
  generatedQuotationId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSolutionScope {
  tenantId: Id;
  opportunityId: Id;
  title: string;
  lines?: NewScopeLine[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

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
    approvedBy: null,
    approvedAt: null,
    generatedQuotationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Approve a scope — the sign-off that makes it priceable. Requires at least one line; a scope with
 * no priceable lines cannot be approved (nothing to quote). Idempotent-safe: throws if already approved. */
export function approveScope(scope: SolutionScope, approvedBy: Id | null): SolutionScope {
  if (scope.status === 'approved') throw new Error('scope is already approved');
  if (scope.lines.length === 0) throw new Error('cannot approve a scope with no lines');
  const now = new Date().toISOString();
  return { ...scope, status: 'approved', approvedBy, approvedAt: now, updatedAt: now };
}

/** Map an approved scope's lines to quotation lines (the direct-sale bridge into R3). */
export function scopeLinesToQuotationLines(scope: SolutionScope): Array<{ description: string; quantity: number; unitPrice: number }> {
  return scope.lines.map((l) => ({
    description: l.discipline ? `${l.discipline}: ${l.description}` : l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
}

export const PREAWARD_EVENT = {
  requirementAdded: 'crm.requirement.added',
  scopeCreated: 'crm.solution_scope.created',
  scopeApproved: 'crm.solution_scope.approved',
  scopeQuoted: 'crm.solution_scope.quoted',
} as const;
