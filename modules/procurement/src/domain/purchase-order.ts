import { type Id, newId } from '@aura/shared';

// Procurement domain — framework-free. A Purchase Order is raised (usually against a
// project) to buy from a supplier — the operate-side spend. It REFERENCES a project by
// id + name snapshot (no cross-module join); the supplier is a name for now (no
// Suppliers module yet).

export type PurchaseOrderStatus = 'draft' | 'issued' | 'received' | 'closed';

export interface PurchaseOrder {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** PO number / reference. */
  reference: string | null;
  title: string;
  supplierName: string | null;
  /** The project this PO is spent against — reference + snapshot, not a join. */
  projectId: Id | null;
  projectName: string | null;
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
  supplierName?: string | null;
  projectId?: Id | null;
  projectName?: string | null;
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
    supplierName: input.supplierName?.trim() || null,
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
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
