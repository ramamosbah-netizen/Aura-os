import { type Id, newId } from './id';

// Deal Register (S5) — the lightweight Decisions / Assumptions / Open-Questions log on an
// Opportunity. One polymorphic entity, three kinds, so a pursuit records the calls it made,
// the beliefs it is betting on, and the questions still hanging. Material + unresolved items
// feed deal risk. Framework-free; deterministic summary lives here for API + UI + tests.

export type RegisterKind = 'DECISION' | 'ASSUMPTION' | 'OPEN_QUESTION';

// Unified status set across the three kinds:
//   DECISION:      OPEN → DECIDED
//   ASSUMPTION:    OPEN → VALIDATED | INVALIDATED
//   OPEN_QUESTION: OPEN → RESOLVED
export type RegisterStatus = 'OPEN' | 'DECIDED' | 'VALIDATED' | 'INVALIDATED' | 'RESOLVED';

/** Which terminal statuses each kind may resolve to. */
export const REGISTER_TERMINALS: Record<RegisterKind, readonly RegisterStatus[]> = {
  DECISION: ['DECIDED'],
  ASSUMPTION: ['VALIDATED', 'INVALIDATED'],
  OPEN_QUESTION: ['RESOLVED'],
};

export interface DealRegisterItem {
  id: Id;
  tenantId: Id;
  relatedType: string;
  relatedId: Id;
  kind: RegisterKind;
  /** The decision made, the assumption held, or the question asked. */
  statement: string;
  status: RegisterStatus;
  /** Rationale (decision), validation note (assumption), or resolution (question). */
  detail: string | null;
  owner: string | null;
  dueAt: string | null;
  /** Assumptions: 0–100 confidence the belief holds. */
  confidence: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDealRegisterItem {
  tenantId: Id;
  relatedType?: string;
  relatedId: Id;
  kind: RegisterKind;
  statement: string;
  detail?: string | null;
  owner?: string | null;
  dueAt?: string | null;
  confidence?: number | null;
}

export function makeRegisterItem(input: NewDealRegisterItem): DealRegisterItem {
  const now = new Date().toISOString();
  const conf = input.confidence == null ? null : Math.max(0, Math.min(100, Number(input.confidence)));
  return {
    id: newId(),
    tenantId: input.tenantId,
    relatedType: input.relatedType ?? 'opportunity',
    relatedId: input.relatedId,
    kind: input.kind,
    statement: input.statement.trim(),
    status: 'OPEN',
    detail: input.detail?.trim() || null,
    owner: input.owner?.trim() || null,
    dueAt: input.dueAt ?? null,
    confidence: input.kind === 'ASSUMPTION' ? conf : null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isRegisterOpen(item: DealRegisterItem): boolean {
  return item.status === 'OPEN';
}

/** Resolve an item to a terminal status valid for its kind (idempotent-safe: throws if already
 * resolved). `detail` records the rationale / resolution. */
export function resolveRegisterItem(
  item: DealRegisterItem,
  to: RegisterStatus,
  detail?: string | null,
  by?: string | null,
): DealRegisterItem {
  if (item.status !== 'OPEN') throw new Error(`register item is already ${item.status}`);
  if (!REGISTER_TERMINALS[item.kind].includes(to)) {
    throw new Error(`${to} is not a valid resolution for a ${item.kind}`);
  }
  const now = new Date().toISOString();
  return {
    ...item,
    status: to,
    detail: detail?.trim() || item.detail,
    resolvedBy: by ?? null,
    resolvedAt: now,
    updatedAt: now,
  };
}

export interface RegisterSummary {
  decisions: number;
  assumptions: number;
  openQuestions: number;
  /** Still OPEN (any kind). */
  open: number;
  /** OPEN assumptions — beliefs not yet validated. */
  unvalidatedAssumptions: number;
  /** Assumptions proven false — material risk. */
  invalidatedAssumptions: number;
  /** OPEN items past their due date. */
  overdue: number;
  needsAttention: boolean;
}

export function registerSummary(items: DealRegisterItem[], now: Date = new Date()): RegisterSummary {
  const today = now.toISOString().slice(0, 10);
  let decisions = 0, assumptions = 0, openQuestions = 0;
  let open = 0, unvalidatedAssumptions = 0, invalidatedAssumptions = 0, overdue = 0;
  for (const i of items) {
    if (i.kind === 'DECISION') decisions++;
    else if (i.kind === 'ASSUMPTION') assumptions++;
    else openQuestions++;

    if (i.status === 'OPEN') {
      open++;
      if (i.kind === 'ASSUMPTION') unvalidatedAssumptions++;
      if (i.dueAt && i.dueAt.slice(0, 10) < today) overdue++;
    }
    if (i.status === 'INVALIDATED') invalidatedAssumptions++;
  }
  return {
    decisions, assumptions, openQuestions, open, unvalidatedAssumptions, invalidatedAssumptions, overdue,
    needsAttention: overdue > 0 || invalidatedAssumptions > 0,
  };
}

export const CRM_REGISTER_EVENT = {
  itemAdded: 'crm.opportunity.register_item_added',
  itemResolved: 'crm.opportunity.register_item_resolved',
} as const;
