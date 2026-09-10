import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

// Procurement domain — framework-free. A Purchase Order is raised (usually against a
// project) to buy from a supplier — the operate-side spend. It REFERENCES a project by
// id + name snapshot (no cross-module join); the supplier is a name for now (no
// Suppliers module yet).

export type PurchaseOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'issued' | 'received' | 'closed';

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
  status: PurchaseOrderStatus;
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
