import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

export type PurchaseRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

/**
 * WHAT A REQUISITION IS FOR — and the two answers must never meet.
 *
 * `operational` buys material for an approved project: it is submitted, approved, and approving it
 * drafts a purchase order that posts committed cost and ordered quantity.
 *
 * `tender_pricing` asks suppliers what a bid's supply scope would cost. It reuses the RFQ, the
 * supplier quotations, the technical evaluation and the commercial comparison — procurement's own
 * authorities, unchanged — and it BUYS NOTHING. It has no project, no approval lifecycle, and no
 * door to a purchase order: not by approval, not by award, not by a line on somebody else's order.
 * Those refusals are enforced here, in every service that could raise an order, and in the
 * database (migration 0387), so no code path and no direct write can cross the line.
 *
 * It never converts. Buying for a won tender starts with a NEW operational requisition.
 */
export type PurchaseRequestPurpose = 'operational' | 'tender_pricing';
export const PURCHASE_REQUEST_PURPOSES: readonly PurchaseRequestPurpose[] = ['operational', 'tender_pricing'];

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
  /** Immutable once written. See `PurchaseRequestPurpose`. */
  purpose: PurchaseRequestPurpose;
  /** The tender this pricing exercise is for. Null on an operational requisition, always. */
  sourceTenderId: Id | null;
  /**
   * The take-off revision the tender's BOQ was projected from when this was raised. A BOQ projected
   * again later is a different scope, and quotations asked against the old one must not quietly
   * start answering the new one.
   */
  sourceBasisRevisionId: string | null;
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
  purpose?: PurchaseRequestPurpose;
  sourceTenderId?: Id | null;
  sourceBasisRevisionId?: string | null;
}

export function isTenderPricing(pr: Pick<PurchaseRequest, 'purpose'>): boolean {
  return pr.purpose === 'tender_pricing';
}

export function makePurchaseRequest(input: NewPurchaseRequest): PurchaseRequest {
  const purpose = input.purpose ?? 'operational';
  if (!PURCHASE_REQUEST_PURPOSES.includes(purpose)) {
    throw new Error(`validation: a requisition purpose must be one of ${PURCHASE_REQUEST_PURPOSES.join(', ')}`);
  }
  const sourceTenderId = input.sourceTenderId ?? null;
  const sourceBasisRevisionId = input.sourceBasisRevisionId?.trim() || null;
  if (purpose === 'tender_pricing') {
    // A pricing exercise names what it prices, and has no project to commit money against.
    if (!sourceTenderId || !sourceBasisRevisionId) {
      throw new Error('validation: a tender-pricing requisition must name its tender and the BOQ basis it prices');
    }
    if (input.projectId) {
      throw new Error('validation: a tender-pricing requisition must not carry a project — it prices a bid, it buys nothing');
    }
    if (input.status && input.status !== 'draft') {
      throw new Error('a tender-pricing requisition can only be a draft — it has no approval lifecycle');
    }
  } else if (sourceTenderId || sourceBasisRevisionId) {
    throw new Error('validation: an operational requisition must not carry tender-pricing references');
  }
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
    purpose,
    sourceTenderId,
    sourceBasisRevisionId,
  };
}

export const PR_EVENT = {
  prCreated: 'procurement.pr.created',
  prUpdated: 'procurement.pr.updated',
  prSubmitted: 'procurement.pr.submitted',
  prApproved: 'procurement.pr.approved',
  prRejected: 'procurement.pr.rejected',
} as const;
