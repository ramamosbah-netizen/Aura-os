import { type Id, newId } from '@aura/shared';

// ── CBS (Cost Breakdown Structure) ─────────────────────────────────────────
// CBS classifies WHERE money is spent. WBS classifies WHAT work is done.
// Together they form the Project Cost Matrix (CBS row × WBS column).

export type CbsCategory = 'direct' | 'indirect' | 'overhead' | 'contingency';

export interface CbsNode {
  id: Id;
  tenantId: Id;
  projectId: Id;
  parentId: Id | null;
  code: string;         // hierarchical code e.g. "01.02.03"
  title: string;
  category: CbsCategory;
  budgetAmount: number;
  committedAmount: number; // PO / subcontract commitment
  actualAmount: number;    // paid / approved invoices
  forecastAmount: number;  // EAC (Estimate at Completion)
  variance: number;        // budget - forecast (computed)
  currency: string;
  notes: string | null;
  createdAt: string;
}

export interface NewCbsNode {
  tenantId: Id;
  projectId: Id;
  parentId?: Id | null;
  code: string;
  title: string;
  category?: CbsCategory;
  budgetAmount?: number;
  committedAmount?: number;
  actualAmount?: number;
  forecastAmount?: number;
  currency?: string;
  notes?: string | null;
}

export function makeCbsNode(input: NewCbsNode): CbsNode {
  const budget = Number.isFinite(input.budgetAmount) ? Number(input.budgetAmount) : 0;
  const forecast = Number.isFinite(input.forecastAmount) ? Number(input.forecastAmount) : budget;

  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    category: input.category ?? 'direct',
    budgetAmount: budget,
    committedAmount: Number.isFinite(input.committedAmount) ? Number(input.committedAmount) : 0,
    actualAmount: Number.isFinite(input.actualAmount) ? Number(input.actualAmount) : 0,
    forecastAmount: forecast,
    variance: Number((budget - forecast).toFixed(2)),
    currency: input.currency ?? 'AED',
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
  };
}

/** Aggregate CBS metrics for a project. */
export interface CbsSummary {
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  totalForecast: number;
  totalVariance: number;
  /** Budget utilisation % (actual / budget). */
  utilisationPct: number;
  /** Commitment coverage % (committed / budget). */
  commitmentPct: number;
  byCategory: Record<CbsCategory, { budget: number; actual: number; forecast: number }>;
}

export function calculateCbsSummary(nodes: CbsNode[]): CbsSummary {
  let totalBudget = 0;
  let totalCommitted = 0;
  let totalActual = 0;
  let totalForecast = 0;

  const byCategory: CbsSummary['byCategory'] = {
    direct: { budget: 0, actual: 0, forecast: 0 },
    indirect: { budget: 0, actual: 0, forecast: 0 },
    overhead: { budget: 0, actual: 0, forecast: 0 },
    contingency: { budget: 0, actual: 0, forecast: 0 },
  };

  for (const n of nodes) {
    totalBudget += n.budgetAmount;
    totalCommitted += n.committedAmount;
    totalActual += n.actualAmount;
    totalForecast += n.forecastAmount;

    const cat = byCategory[n.category];
    if (cat) {
      cat.budget += n.budgetAmount;
      cat.actual += n.actualAmount;
      cat.forecast += n.forecastAmount;
    }
  }

  return {
    totalBudget,
    totalCommitted,
    totalActual,
    totalForecast,
    totalVariance: Number((totalBudget - totalForecast).toFixed(2)),
    utilisationPct: totalBudget > 0 ? Number(((totalActual / totalBudget) * 100).toFixed(1)) : 0,
    commitmentPct: totalBudget > 0 ? Number(((totalCommitted / totalBudget) * 100).toFixed(1)) : 0,
    byCategory,
  };
}
