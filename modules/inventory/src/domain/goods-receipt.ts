import { type Id, newId } from '@aura/shared';

// Inventory domain — framework-free. A Goods Receipt Note (GRN) records goods received
// against a Purchase Order — the next operate-side step after procurement. It REFERENCES
// the PO by id + title snapshot, and carries the supplier + project snapshots down from
// it — no cross-module join.

export type GoodsReceiptStatus = 'draft' | 'received' | 'cancelled';

export interface GoodsReceipt {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** GRN number / reference. */
  reference: string | null;
  /** Description of the goods received. */
  title: string;
  /** The PO these goods are received against — reference + snapshot, not a join. */
  poId: Id | null;
  poTitle: string | null;
  /** Carried down from the PO — snapshots, not joins. */
  supplierName: string | null;
  projectId: Id | null;
  projectName: string | null;
  status: GoodsReceiptStatus;
  /** Received value. */
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewGoodsReceipt {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  poId?: Id | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: Id | null;
  projectName?: string | null;
  status?: GoodsReceiptStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeGoodsReceipt(input: NewGoodsReceipt): GoodsReceipt {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    poId: input.poId ?? null,
    poTitle: input.poTitle ?? null,
    supplierName: input.supplierName?.trim() || null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    status: input.status ?? 'received',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Inventory events on the spine. */
export const INVENTORY_EVENT = {
  grnCreated: 'inventory.grn.created',
  grnUpdated: 'inventory.grn.updated',
  grnInspected: 'inventory.grn.inspected',
  grnAccepted: 'inventory.grn.accepted',
  stockLow: 'inventory.stock.low',
} as const;
