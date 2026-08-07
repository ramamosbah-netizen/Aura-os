import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

// Procurement domain — framework-free. A Purchase Order is raised (usually against a
// project) to buy from a supplier — the operate-side spend. It REFERENCES a project by
// id + name snapshot (no cross-module join); the supplier is a name for now (no
// Suppliers module yet).

export type PurchaseOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'issued' | 'received' | 'closed' | 'cancelled';

/**
 * The purchase-order lifecycle. `changeStatus` used to accept any target from any state (the status
 * DTO is only `@IsString`), so a PO could be set to an invalid status, moved backwards, or — the
 * dangerous one — **un-cancelled**: cancelling a PO reverses its committed cost on the CBS, and
 * moving it back to `issued` left it live again while the cost stayed reversed, so the project's
 * committed spend silently understated the order. Terminal states (`closed`, `cancelled`) allow no
 * exit; the machine is the same shape the tests already drive (submit → approve → issue → receive →
 * close, cancel from anywhere live).
 */
const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['pending_approval', 'approved', 'issued', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['issued', 'cancelled'],
  issued: ['received', 'closed', 'cancelled'],
  received: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export function isPurchaseOrderStatus(s: string): s is PurchaseOrderStatus {
  return Object.prototype.hasOwnProperty.call(PO_TRANSITIONS, s);
}

/** Guard a PO status change. Throws on an unknown status (400) or an illegal transition (409). */
export function assertPoTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!isPurchaseOrderStatus(to)) throw new Error(`unknown purchase order status "${to}"`);
  const allowed = PO_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    // "can only move" leads so the error taxonomy classifies an illegal transition as a 409 conflict.
    const where = allowed.length ? allowed.join(', ') : 'nowhere — it is terminal';
    throw new Error(`a ${from} purchase order can only move to ${where}, not ${to}`);
  }
}

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
  // A missing/garbage value coerces to 0 (a draft PO priced later), but a NEGATIVE value is never
  // valid — it would post a negative committed cost to the CBS and fall under the auto-approve
  // threshold, escaping the approval matrix.
  const value = Number.isFinite(input.value) ? Number(input.value) : 0;
  if (value < 0) throw new Error('purchase order value cannot be negative');
  // An ordered quantity, when coded, feeds the Quantity Ledger, so a negative or non-numeric one
  // would corrupt the ordered position — reject it rather than storing NaN.
  let orderedQuantity: number | null = null;
  if (input.orderedQuantity != null) {
    const q = Number(input.orderedQuantity);
    if (!Number.isFinite(q) || q <= 0) throw new Error('ordered quantity must be a positive number');
    orderedQuantity = q;
  }
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
    cbsNodeId: input.cbsNodeId ?? null,
    boqItemId: input.boqItemId ?? null,
    orderedQuantity,
    unit: input.unit?.trim() || null,
    discipline: toDiscipline(input.discipline),
    status: input.status ?? 'draft',
    value,
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
