import { type Id, newId } from '@aura/shared';

/**
 * Cost Centre — a management-accounting dimension. Journal lines may be tagged with a
 * cost-centre id; the cost-centre report folds the GL by that tag (debits − credits) to
 * show net spend/contribution per centre, independent of the statutory chart of accounts.
 */
export interface CostCenter {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewCostCenter {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  name: string;
  createdBy?: Id | null;
}

export function makeCostCenter(input: NewCostCenter): CostCenter {
  if (!input.code?.trim()) throw new Error('cost centre code is required');
  if (!input.name?.trim()) throw new Error('cost centre name is required');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export interface CostCenterActual {
  costCenterId: Id;
  code: string;
  name: string;
  debit: number;
  credit: number;
  net: number; // debit − credit (net cost)
}

export interface CostCenterReport {
  lines: CostCenterActual[];
  unallocated: { debit: number; credit: number; net: number };
  grandNet: number;
}

interface JLine { debit: number; credit: number; costCenterId: Id | null }

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Fold GL journal lines by cost-centre tag (debits − credits); untagged lines roll into `unallocated`. */
export function buildCostCenterReport(centers: CostCenter[], lines: JLine[]): CostCenterReport {
  const byId = new Map<Id, CostCenterActual>();
  for (const c of centers) byId.set(c.id, { costCenterId: c.id, code: c.code, name: c.name, debit: 0, credit: 0, net: 0 });
  const unallocated = { debit: 0, credit: 0, net: 0 };

  for (const l of lines) {
    const bucket = l.costCenterId ? byId.get(l.costCenterId) : undefined;
    if (bucket) {
      bucket.debit += l.debit;
      bucket.credit += l.credit;
    } else {
      unallocated.debit += l.debit;
      unallocated.credit += l.credit;
    }
  }

  const out: CostCenterActual[] = [];
  for (const b of byId.values()) {
    b.debit = r2(b.debit); b.credit = r2(b.credit); b.net = r2(b.debit - b.credit);
    out.push(b);
  }
  unallocated.debit = r2(unallocated.debit); unallocated.credit = r2(unallocated.credit); unallocated.net = r2(unallocated.debit - unallocated.credit);
  out.sort((a, b) => (a.code < b.code ? -1 : 1));
  const grandNet = r2(out.reduce((s, l) => s + l.net, 0) + unallocated.net);
  return { lines: out, unallocated, grandNet };
}

export const COST_CENTER_EVENT = {
  created: 'finance.cost_center.created',
} as const;
