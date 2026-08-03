import { type Id, newId } from '@aura/shared';

// The Project Quantity Ledger — the physical twin of the Cost Ledger.
//
// The Cost Ledger answers "how much money" (keyed to a CBS cost line). The Quantity Ledger answers
// "how much stuff / work" (keyed to a BOQ item — the measured line, in its own unit of measure).
// No module mutates a BOQ item's live quantities directly: every quantity-bearing event becomes an
// append-only QuantityTransaction, and a BOQ item's position is SUM(this) sliced by type. So a
// return-to-store, a rejected delivery, or a reversal is simply a NEGATIVE entry.
//
// The seven positions track a unit of work down the delivery chain:
//   BOQ (target) → Ordered (PO) → Received (GRN) → Issued (to site) → Installed (fixed) →
//   Approved (inspected) → Invoiced (certified to the client).
// The gaps between them are the operational signals: remaining-to-order, in-transit, on-site stock,
// wastage (issued − installed), pending-approval, pending-billing.

/** The position bucket this quantity lands in. Sign lives in `quantity` (negative = return/reject/reversal). */
export type QtyTxnType = 'boq' | 'ordered' | 'received' | 'issued' | 'installed' | 'approved' | 'invoiced';

/** Where the quantity came from — provenance for the drill-down. */
export type QtyTxnSource =
  | 'boq_baseline' | 'po' | 'grn' | 'material_issue' | 'material_return'
  | 'daily_report' | 'installation' | 'inspection' | 'ipc'
  | 'reversal' | 'adjustment' | 'other';

export interface QuantityTransaction {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  /** The BOQ (measured) item this posts to — the key. The Quantity Ledger is SUM(this) per item. */
  boqItemId: Id;
  /** Optional cross-reference to the cost line, so cost × quantity can be matrixed later. */
  cbsNodeId: Id | null;
  type: QtyTxnType;
  /** The movement in the item's unit of measure. May be negative (return, reject, reversal). */
  quantity: number;
  /** Unit of measure snapshot (m, m³, nr, kg…) — carried so the position knows its UoM. */
  unit: string | null;
  source: QtyTxnSource;
  /** The originating document reference, e.g. "PO-1023" / "GRN-55" / "MI-12". */
  sourceRef: string | null;
  /** Free-form slicing keys (location, drawing, floor, zone, supplier…). */
  dimensions: Record<string, string> | null;
  occurredAt: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewQuantityTransaction {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  boqItemId: Id;
  cbsNodeId?: Id | null;
  type: QtyTxnType;
  quantity: number;
  unit?: string | null;
  source: QtyTxnSource;
  sourceRef?: string | null;
  dimensions?: Record<string, string> | null;
  occurredAt?: string;
  createdBy?: Id | null;
}

export function makeQuantityTransaction(input: NewQuantityTransaction): QuantityTransaction {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    boqItemId: input.boqItemId,
    cbsNodeId: input.cbsNodeId ?? null,
    type: input.type,
    quantity: Number(input.quantity) || 0,
    unit: input.unit?.trim() || null,
    source: input.source,
    sourceRef: input.sourceRef?.trim() || null,
    dimensions: input.dimensions && Object.keys(input.dimensions).length > 0 ? input.dimensions : null,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    createdBy: input.createdBy ?? null,
  };
}

/** The live position of a BOQ item down the delivery chain — every figure is SUM(ledger) by type. */
export interface QuantityPosition {
  boqItemId: Id;
  unit: string | null;
  // The seven positions (each = SUM of that type's signed entries).
  boq: number;
  ordered: number;
  received: number;
  issued: number;
  installed: number;
  approved: number;
  invoiced: number;
  // Derived gaps — the operational signals.
  remainingToOrder: number; // boq − ordered
  inTransit: number;        // ordered − received (ordered, not yet delivered)
  onSite: number;           // received − issued  (delivered, not yet issued — site stock)
  wastage: number;          // issued − installed (issued, not yet installed — offcut/wastage/WIP)
  pendingApproval: number;  // installed − approved
  pendingBilling: number;   // approved − invoiced
  /** Physical progress against the target: installed / boq (the EV "% complete" input; 0 when no target). */
  progressPct: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Roll a BOQ item's quantity transactions into its live position — the source of truth for progress. */
export function quantityPosition(boqItemId: Id, txns: QuantityTransaction[]): QuantityPosition {
  const sum = (t: QtyTxnType): number => r2(txns.filter((x) => x.type === t).reduce((s, x) => s + x.quantity, 0));
  const unit = txns.find((x) => x.unit)?.unit ?? null;
  const boq = sum('boq');
  const ordered = sum('ordered');
  const received = sum('received');
  const issued = sum('issued');
  const installed = sum('installed');
  const approved = sum('approved');
  const invoiced = sum('invoiced');
  return {
    boqItemId,
    unit,
    boq,
    ordered,
    received,
    issued,
    installed,
    approved,
    invoiced,
    remainingToOrder: r2(boq - ordered),
    inTransit: r2(ordered - received),
    onSite: r2(received - issued),
    wastage: r2(issued - installed),
    pendingApproval: r2(installed - approved),
    pendingBilling: r2(approved - invoiced),
    progressPct: boq > 0 ? r2((installed / boq) * 100) : 0,
  };
}
