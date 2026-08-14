import { randomUUID } from 'node:crypto';
import { moneyNumber as r2 } from '@aura/shared';

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
  /** All-in cost per man-hour (labour rate). 0 = untracked → no cost posts. */
  costRate: number;
  /** Derived labour cost for this allocation: manHours × costRate. */
  labourCost: number;
  /** CBS cost line this labour is charged to. When set (with a costRate), the Transaction
   * Engine posts the labour cost as ACTUAL against it. Nullable + additive. */
  cbsNodeId: string | null;
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
  costRate?: number;
  cbsNodeId?: string | null;
  subcontractorName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}


export function makeLabourAllocation(input: NewLabourAllocation): LabourAllocation {
  const now = new Date().toISOString();
  const headcount = Number(input.headcount) || 0;
  const hours = Number(input.hours) || 0;
  const manHours = r2(headcount * hours);
  const costRate = Math.max(0, Number(input.costRate) || 0);
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
    manHours,
    costRate,
    labourCost: r2(manHours * costRate),
    cbsNodeId: input.cbsNodeId ?? null,
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
