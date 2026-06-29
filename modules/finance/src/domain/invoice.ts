import { type Id, newId } from '@aura/shared';

// Finance domain — framework-free. A (supplier / AP) Invoice is raised against a Purchase
// Order — the "pay" step that closes the operate loop (spend -> receive -> pay). It
// REFERENCES the PO by id + title snapshot and carries the supplier + project snapshots
// down from it — no cross-module join.

export type InvoiceStatus = 'draft' | 'approved' | 'paid' | 'cancelled';

export interface Invoice {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Invoice number / reference. */
  reference: string | null;
  /** What is being invoiced. */
  title: string;
  /** The PO this invoice bills against — reference + snapshot, not a join. */
  poId: Id | null;
  poTitle: string | null;
  /** Carried down from the PO — snapshots, not joins. */
  supplierName: string | null;
  projectId: Id | null;
  projectName: string | null;
  wbsNodeId: Id | null;
  status: InvoiceStatus;
  /** Invoice amount. */
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewInvoice {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  poId?: Id | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: Id | null;
  projectName?: string | null;
  wbsNodeId?: Id | null;
  status?: InvoiceStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeInvoice(input: NewInvoice): Invoice {
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
    wbsNodeId: input.wbsNodeId ?? null,
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Finance events on the spine. */
export const FINANCE_EVENT = {
  invoiceCreated: 'finance.invoice.created',
  invoiceUpdated: 'finance.invoice.updated',
  invoiceApproved: 'finance.invoice.approved',
  invoicePaid: 'finance.invoice.paid',
  paymentRecorded: 'finance.payment.recorded',
  journalPosted: 'finance.journal.posted',
} as const;
