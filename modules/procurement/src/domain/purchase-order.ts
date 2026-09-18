import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

// Procurement domain — framework-free. A Purchase Order is raised (usually against a
// project) to buy from a supplier — the operate-side spend. It REFERENCES a project by
// id + name snapshot (no cross-module join); the supplier is a name for now (no
// Suppliers module yet).

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'issued'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export interface PurchaseOrder {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** PO number / reference. */
  reference: string | null;
  title: string;
  /** Approved-vendor FK into the supplier master (null for legacy/free-text POs). */
  supplierId: Id | null;
  supplierName: string | null;
  /** The project this PO is spent against — reference + snapshot, not a join. */
  projectId: Id | null;
  projectName: string | null;
  /**
   * Sourcing lineage (PROC-GAP-03). The RFQ this PO was awarded from, and the purchase request that
   * RFQ answered — so the chain PR → RFQ → PO → GRN is traceable end to end. Both null for a PO
   * raised directly (no competitive sourcing), which stays valid.
   */
  rfqId: Id | null;
  prId: Id | null;
  /** The CBS cost line this PO is coded to — where its committed cost accrues (source of truth). */
  cbsNodeId: Id | null;
  /** The BOQ (measured) item this PO orders against — where its ORDERED quantity accrues on the
   * Quantity Ledger. With `orderedQuantity` + `unit`, po.created posts +ordered, cancel reverses it. */
  boqItemId: Id | null;
  orderedQuantity: number | null;
  unit: string | null;
  /** Shared dimension (ADR-0012) — the trade/discipline this spend belongs to. */
  discipline: Discipline;
  /**
   * THE SUPPLIER'S OWN COMMERCIAL TERMS (SUP-14), carried across from the offer that was awarded
   * rather than retyped. Every one of them is NULL when unknown, and NULL is UNKNOWN throughout: an
   * order whose tax treatment nobody stated must not read as tax-exclusive by accident.
   *
   * `currency` is the TRANSACTION currency — one order, one supplier, one currency (migration 0336).
   * It is the currency the supplier quoted in and will invoice in, never the currency offers were
   * compared in. A comparison normalises a USD offer to AED so a buyer can weigh it against another;
   * writing that AED figure onto the order would redenominate a contract into a currency the
   * supplier never quoted, at a rate they never agreed. NULL keeps its historical meaning: an order
   * raised before this existed was never told its currency, and is read as the company's base.
   */
  currency: string | null;
  /**
   * The approved sourcing decision that raised this order, and the offer revision it was awarded
   * from — so the order's terms can always be read back against their source, and the spend traced
   * to the authority that approved it. Both NULL for an order raised outside sourcing, which stays
   * valid: a requisition can become an order directly.
   */
  sourcingRecommendationId: Id | null;
  /**
   * WHICH SELECTION within that recommendation — one supplier's share of the decision. A unique
   * index keys on it (migration 0358), so one selection can raise at most one order however many
   * times an award is attempted.
   */
  recommendationSelectionId: Id | null;
  quotationRevisionId: Id | null;
  /** The supplier's OWN reference for the quotation, as they wrote it. */
  supplierQuotationRef: string | null;
  taxTreatment: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct: number | null;
  /**
   * Freight as the supplier quoted it: AT THE ORDER, not spread across the lines. Allocating it
   * would invent a per-item cost nobody quoted, and `value` therefore excludes it — the order's
   * governing value is what its lines come to (`orderGoverningValue`), and freight is a term of the
   * order stated beside it.
   */
  freightAmount: number | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  status: PurchaseOrderStatus;
  /**
   * HOW THIS ORDER GOT TO ITS STATUS (J3-01). A status says WHERE an order is and has never said how
   * it arrived — no approver, no time, no reason — so a status set by a governed command and one set
   * by a generic PATCH were indistinguishable after the fact. That is why an update-only actor could
   * issue, cancel and close orders for as long as they could.
   *
   * `approvalBasis` is the one worth reading twice: `automatic` is an approval that HAPPENED, taken
   * by the matrix on nobody's behalf because the value fell in the auto-approve tier. It is not an
   * order that skipped approval — that distinction is the whole of the issue rule.
   */
  approvedBy: Id | null;
  approvedAt: string | null;
  approvalLevel: number | null;
  approvalBasis: 'manual' | 'automatic' | null;
  issuedBy: Id | null;
  issuedAt: string | null;
  cancelledBy: Id | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** What the cancellation REVERSED — the commitment less whatever had already become real. */
  cancelledValue: number | null;
  closedBy: Id | null;
  closedAt: string | null;
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPurchaseOrder {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  supplierId?: Id | null;
  supplierName?: string | null;
  projectId?: Id | null;
  projectName?: string | null;
  rfqId?: Id | null;
  prId?: Id | null;
  cbsNodeId?: Id | null;
  boqItemId?: Id | null;
  orderedQuantity?: number | null;
  unit?: string | null;
  discipline?: Discipline;
  status?: PurchaseOrderStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
  currency?: string | null;
  sourcingRecommendationId?: Id | null;
  recommendationSelectionId?: Id | null;
  quotationRevisionId?: Id | null;
  supplierQuotationRef?: string | null;
  taxTreatment?: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct?: number | null;
  freightAmount?: number | null;
  freightTerms?: string | null;
  paymentTerms?: string | null;
  approvedBy?: Id | null;
  approvedAt?: string | null;
  approvalLevel?: number | null;
  approvalBasis?: 'manual' | 'automatic' | null;
  issuedBy?: Id | null;
  issuedAt?: string | null;
  cancelledBy?: Id | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledValue?: number | null;
  closedBy?: Id | null;
  closedAt?: string | null;
}

export function makePurchaseOrder(input: NewPurchaseOrder): PurchaseOrder {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName?.trim() || null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    rfqId: input.rfqId ?? null,
    prId: input.prId ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    boqItemId: input.boqItemId ?? null,
    orderedQuantity: input.orderedQuantity != null ? Number(input.orderedQuantity) : null,
    unit: input.unit?.trim() || null,
    discipline: toDiscipline(input.discipline),
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    currency: input.currency?.trim() || null,
    sourcingRecommendationId: input.sourcingRecommendationId ?? null,
    recommendationSelectionId: input.recommendationSelectionId ?? null,
    quotationRevisionId: input.quotationRevisionId ?? null,
    supplierQuotationRef: input.supplierQuotationRef?.trim() || null,
    taxTreatment: input.taxTreatment ?? null,
    taxRatePct: input.taxRatePct ?? null,
    freightAmount: input.freightAmount ?? null,
    freightTerms: input.freightTerms?.trim() || null,
    paymentTerms: input.paymentTerms?.trim() || null,
    // NULL throughout on creation. A new order has been approved by nobody, issued by nobody and
    // cancelled by nobody, and saying so is different from having no opinion.
    approvedBy: input.approvedBy ?? null,
    approvedAt: input.approvedAt ?? null,
    approvalLevel: input.approvalLevel ?? null,
    approvalBasis: input.approvalBasis ?? null,
    issuedBy: input.issuedBy ?? null,
    issuedAt: input.issuedAt ?? null,
    cancelledBy: input.cancelledBy ?? null,
    cancelledAt: input.cancelledAt ?? null,
    cancellationReason: input.cancellationReason ?? null,
    cancelledValue: input.cancelledValue ?? null,
    closedBy: input.closedBy ?? null,
    closedAt: input.closedAt ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Procurement events on the spine. */
export const PROCUREMENT_EVENT = {
  poCreated: 'procurement.po.created',
  poUpdated: 'procurement.po.updated',
  poApproved: 'procurement.po.approved',
  poIssued: 'procurement.po.issued',
  poClosed: 'procurement.po.closed',
} as const;
