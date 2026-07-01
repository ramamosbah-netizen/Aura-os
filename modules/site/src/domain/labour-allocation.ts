import { randomUUID } from 'node:crypto';

// Site domain — framework-free. A LabourAllocation records daily manpower on a project by
// trade (headcount × hours), the basis for labour productivity, cost allocation, and the
// site diary's manpower section.

export interface LabourAllocation {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  trade: string;
  headcount: number;
  hours: number;
  /** Convenience roll-up: headcount × hours. */
  manHours: number;
  subcontractorName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewLabourAllocation {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  trade: string;
  headcount: number;
  hours: number;
  subcontractorName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function makeLabourAllocation(input: NewLabourAllocation): LabourAllocation {
  const now = new Date().toISOString();
  const headcount = Number(input.headcount) || 0;
  const hours = Number(input.hours) || 0;
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date.slice(0, 10),
    trade: input.trade.trim(),
    headcount,
    hours,
    manHours: r2(headcount * hours),
    subcontractorName: input.subcontractorName?.trim() || null,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface TradeManHours {
  trade: string;
  headcount: number;
  manHours: number;
}

/** Roll up allocations by trade (headcount summed, man-hours summed). */
export function summariseByTrade(rows: LabourAllocation[]): TradeManHours[] {
  const byTrade = new Map<string, TradeManHours>();
  for (const r of rows) {
    const t = byTrade.get(r.trade) ?? { trade: r.trade, headcount: 0, manHours: 0 };
    t.headcount += r.headcount;
    t.manHours = r2(t.manHours + r.manHours);
    byTrade.set(r.trade, t);
  }
  return [...byTrade.values()].sort((a, b) => b.manHours - a.manHours);
}
