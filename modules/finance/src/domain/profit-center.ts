import { type Id, newId } from '@aura/shared';

/**
 * Profit Centre — a management-accounting dimension tracking contribution (revenue − cost)
 * for a business unit / product line. Journal lines may be tagged with a profit-centre id;
 * the report folds the GL by tag with net = credit − debit (revenue is credit-normal, so a
 * positive net = contribution / profit).
 */
export interface ProfitCenter {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewProfitCenter {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  name: string;
  createdBy?: Id | null;
}

export function makeProfitCenter(input: NewProfitCenter): ProfitCenter {
  if (!input.code?.trim()) throw new Error('profit centre code is required');
  if (!input.name?.trim()) throw new Error('profit centre name is required');
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

export interface ProfitCenterActual {
  profitCenterId: Id;
  code: string;
  name: string;
  debit: number;
  credit: number;
  contribution: number; // credit − debit
}

export interface ProfitCenterReport {
  lines: ProfitCenterActual[];
  unallocated: { debit: number; credit: number; contribution: number };
  grandContribution: number;
}

interface JLine { debit: number; credit: number; profitCenterId: Id | null }

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Fold GL journal lines by profit-centre tag; contribution = credit − debit. Untagged → unallocated. */
export function buildProfitCenterReport(centers: ProfitCenter[], lines: JLine[]): ProfitCenterReport {
  const byId = new Map<Id, ProfitCenterActual>();
  for (const c of centers) byId.set(c.id, { profitCenterId: c.id, code: c.code, name: c.name, debit: 0, credit: 0, contribution: 0 });
  const unallocated = { debit: 0, credit: 0, contribution: 0 };

  for (const l of lines) {
    const bucket = l.profitCenterId ? byId.get(l.profitCenterId) : undefined;
    const t = bucket ?? unallocated;
    t.debit += l.debit;
    t.credit += l.credit;
  }

  const out: ProfitCenterActual[] = [];
  for (const b of byId.values()) {
    b.debit = r2(b.debit); b.credit = r2(b.credit); b.contribution = r2(b.credit - b.debit);
    out.push(b);
  }
  unallocated.debit = r2(unallocated.debit); unallocated.credit = r2(unallocated.credit); unallocated.contribution = r2(unallocated.credit - unallocated.debit);
  out.sort((a, b) => (a.code < b.code ? -1 : 1));
  const grandContribution = r2(out.reduce((s, l) => s + l.contribution, 0) + unallocated.contribution);
  return { lines: out, unallocated, grandContribution };
}

export const PROFIT_CENTER_EVENT = {
  created: 'finance.profit_center.created',
} as const;
