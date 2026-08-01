import { randomUUID } from 'node:crypto';

// Inventory domain — framework-free. A SerialUnit is one physically-tracked, serialised item:
// the individual CCTV camera / controller / switch identified by its manufacturer serial. ELV
// work lives and dies on serials — warranty claims, asset registers, replacements and recalls
// all key off "which exact unit is where". This is the per-unit ledger stock quantities can't give.

export type SerialStatus = 'in_stock' | 'issued' | 'installed' | 'returned' | 'faulty';

export interface SerialUnit {
  id: string;
  tenantId: string;
  companyId: string | null;
  serialNumber: string;
  itemCode: string;
  itemName: string;
  warehouse: string | null;
  grnId: string | null;
  status: SerialStatus;
  projectId: string | null;
  projectName: string | null;
  location: string | null;
  installedAt: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSerialUnit {
  tenantId: string;
  companyId?: string | null;
  serialNumber: string;
  itemCode: string;
  itemName: string;
  warehouse?: string | null;
  grnId?: string | null;
  createdBy?: string | null;
}

export function makeSerialUnit(input: NewSerialUnit): SerialUnit {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    serialNumber: input.serialNumber.trim(),
    itemCode: input.itemCode.trim(),
    itemName: input.itemName.trim(),
    warehouse: input.warehouse?.trim() || null,
    grnId: input.grnId ?? null,
    status: 'in_stock',
    projectId: null,
    projectName: null,
    location: null,
    installedAt: null,
    warrantyStartDate: null,
    warrantyMonths: null,
    notes: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Issue a unit to a project (in_stock/returned → issued). */
export function issue(u: SerialUnit, patch: { projectId: string; projectName?: string | null }): SerialUnit {
  if (u.status === 'faulty') throw new Error('conflict: a faulty unit must be returned before it can be issued');
  if (u.status === 'installed') throw new Error('conflict: unit is already installed');
  return { ...u, status: 'issued', projectId: patch.projectId, projectName: patch.projectName ?? u.projectName, updatedAt: new Date().toISOString() };
}

/** Install a unit on site (issued → installed) and start its warranty clock. */
export function install(
  u: SerialUnit,
  patch: { location?: string | null; warrantyMonths?: number; warrantyStartDate?: string },
): SerialUnit {
  if (u.status !== 'issued') throw new Error('only an issued unit can be installed');
  const now = new Date().toISOString();
  return {
    ...u,
    status: 'installed',
    location: patch.location?.trim() || u.location,
    installedAt: now,
    warrantyStartDate: patch.warrantyStartDate ?? now.slice(0, 10),
    warrantyMonths: patch.warrantyMonths ?? u.warrantyMonths ?? 12,
    updatedAt: now,
  };
}

/** Return a unit to stock (issued/installed/faulty → in_stock), clearing its project link. */
export function returnToStock(u: SerialUnit): SerialUnit {
  if (u.status === 'in_stock') throw new Error('conflict: unit is already in stock');
  return { ...u, status: 'in_stock', projectId: null, projectName: null, location: null, updatedAt: new Date().toISOString() };
}

/** Flag a unit faulty (any state → faulty) with the reason. */
export function markFaulty(u: SerialUnit, reason: string): SerialUnit {
  return { ...u, status: 'faulty', notes: reason?.trim() || u.notes, updatedAt: new Date().toISOString() };
}
