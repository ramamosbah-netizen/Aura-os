import { type Id, newId } from '@aura/shared';

/**
 * Project Cash-Flow Forecast — a per-project projection of monthly inflows (progress billing /
 * receipts) vs outflows (subcontract, materials, labour, overhead). One record per project; the
 * summary computes net per period and the running cumulative position (the classic S-curve), so a
 * PM sees the peak funding requirement (most-negative cumulative).
 */
export interface CashflowPeriod {
  period: string; // YYYY-MM
  inflow: number;
  outflow: number;
}

export interface ProjectCashflowForecast {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  periods: CashflowPeriod[];
  notes: string;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCashflowForecast {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  periods?: NewCashflowPeriod[];
  notes?: string;
  createdBy?: Id | null;
}

export interface NewCashflowPeriod {
  period: string;
  inflow?: number;
  outflow?: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function buildPeriod(input: NewCashflowPeriod): CashflowPeriod {
  if (!input.period || !/^\d{4}-\d{2}$/.test(input.period)) throw new Error('period must be YYYY-MM');
  const inflow = Number(input.inflow ?? 0);
  const outflow = Number(input.outflow ?? 0);
  if (!Number.isFinite(inflow) || inflow < 0) throw new Error('inflow cannot be negative');
  if (!Number.isFinite(outflow) || outflow < 0) throw new Error('outflow cannot be negative');
  return { period: input.period, inflow: r2(inflow), outflow: r2(outflow) };
}

export function makeCashflowForecast(input: NewCashflowForecast): ProjectCashflowForecast {
  if (!input.projectId) throw new Error('projectId is required');
  const periods = (input.periods ?? []).map(buildPeriod).sort((a, b) => (a.period < b.period ? -1 : 1));
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    periods,
    notes: input.notes?.trim() || '',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace the forecast's periods (kept sorted). */
export function setForecastPeriods(f: ProjectCashflowForecast, periods: NewCashflowPeriod[]): ProjectCashflowForecast {
  return { ...f, periods: periods.map(buildPeriod).sort((a, b) => (a.period < b.period ? -1 : 1)), updatedAt: new Date().toISOString() };
}

export interface CashflowProjectionRow {
  period: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
}

export interface CashflowSummary {
  rows: CashflowProjectionRow[];
  totalInflow: number;
  totalOutflow: number;
  netTotal: number;
  /** Most-negative cumulative position = the peak funding requirement. */
  peakFunding: number;
}

/** Roll the periods into a net + running-cumulative projection + the peak funding requirement. */
export function summariseCashflow(f: ProjectCashflowForecast): CashflowSummary {
  let cumulative = 0;
  let peakFunding = 0;
  const rows: CashflowProjectionRow[] = f.periods.map((p) => {
    const net = r2(p.inflow - p.outflow);
    cumulative = r2(cumulative + net);
    if (cumulative < peakFunding) peakFunding = cumulative;
    return { period: p.period, inflow: p.inflow, outflow: p.outflow, net, cumulative };
  });
  const totalInflow = r2(f.periods.reduce((s, p) => s + p.inflow, 0));
  const totalOutflow = r2(f.periods.reduce((s, p) => s + p.outflow, 0));
  return { rows, totalInflow, totalOutflow, netTotal: r2(totalInflow - totalOutflow), peakFunding };
}

export const CASHFLOW_EVENT = {
  saved: 'projects.cashflow_forecast.saved',
} as const;
