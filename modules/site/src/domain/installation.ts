import { randomUUID } from 'node:crypto';

// Site domain — framework-free. An InstallationRecord captures physical work FIXED IN PLACE on a
// project against a BOQ (measured) item: a quantity installed on a date. It is the production
// measure behind progress — the Quantity Ledger's INSTALLED position, and (later) the WBS %.
// The gap Issued − Installed is wastage/offcut/work-in-progress; Installed − Approved is the
// inspection backlog.

export interface InstallationRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  /** The BOQ (measured) item this installed quantity is booked against — the Quantity Ledger key. */
  boqItemId: string;
  /** Optional cross-reference to the cost line, for the cost × quantity matrix. */
  cbsNodeId: string | null;
  date: string; // YYYY-MM-DD
  description: string;
  quantity: number;
  unit: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewInstallationRecord {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  boqItemId: string;
  cbsNodeId?: string | null;
  date: string;
  description: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export function makeInstallationRecord(input: NewInstallationRecord): InstallationRecord {
  if (!input.boqItemId || !input.boqItemId.trim()) throw new Error('boqItemId is required');
  if (!input.description || !input.description.trim()) throw new Error('description is required');
  const qty = Number(input.quantity) || 0;
  if (qty <= 0) throw new Error('installed quantity must be positive');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    boqItemId: input.boqItemId.trim(),
    cbsNodeId: input.cbsNodeId ?? null,
    date: input.date.slice(0, 10),
    description: input.description.trim(),
    quantity: qty,
    unit: input.unit?.trim() || 'nr',
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
