import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

export type PurchaseRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

/**
 * The purchase-request lifecycle. Approving a PR auto-creates a draft Purchase Order, so `approved`
 * is terminal: without a guard, re-sending `approved` to an already-approved PR spawned a SECOND PO
 * (and, once the PO is coded, a second committed cost) — the same event-emitting-setter defect as a
 * re-certified IPC billing twice. A rejected request can be reworked back to draft/submitted, but
 * not flipped straight to approved.
 */
const PR_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  draft: ['submitted', 'approved', 'rejected'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: [],
  rejected: ['draft', 'submitted'],
};

export function isPurchaseRequestStatus(s: string): s is PurchaseRequestStatus {
  return Object.prototype.hasOwnProperty.call(PR_TRANSITIONS, s);
}

/** Guard a PR status change. Throws on an unknown status or an illegal transition (409). */
export function assertPrTransition(from: PurchaseRequestStatus, to: PurchaseRequestStatus): void {
  if (!isPurchaseRequestStatus(to)) throw new Error(`unknown purchase request status "${to}"`);
  const allowed = PR_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const where = allowed.length ? allowed.join(', ') : 'nowhere — it is terminal';
    throw new Error(`a ${from} purchase request can only move to ${where}, not ${to}`);
  }
}

export interface PurchaseRequest {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  reference: string | null;
  title: string;
  projectId: Id | null;
  projectName: string | null;
  /** Shared dimension (ADR-0012) — the trade/discipline this request belongs to. */
  discipline: Discipline;
  status: PurchaseRequestStatus;
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPurchaseRequest {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  projectId?: Id | null;
  projectName?: string | null;
  discipline?: Discipline;
  status?: PurchaseRequestStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makePurchaseRequest(input: NewPurchaseRequest): PurchaseRequest {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    discipline: toDiscipline(input.discipline),
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export const PR_EVENT = {
  prCreated: 'procurement.pr.created',
  prUpdated: 'procurement.pr.updated',
  prSubmitted: 'procurement.pr.submitted',
  prApproved: 'procurement.pr.approved',
  prRejected: 'procurement.pr.rejected',
} as const;
