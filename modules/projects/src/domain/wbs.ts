import { type Id, newId } from '@aura/shared';

export type WbsNodeStatus = 'pending' | 'in_progress' | 'completed';

export interface WbsNode {
  id: Id;
  tenantId: Id;
  projectId: Id;
  parentId: Id | null;
  code: string; // e.g., "1.0", "1.1", "1.1.1"
  title: string;
  plannedValue: number; // Baseline budgeted cost
  /** Whether plannedValue was explicitly supplied (missing is UNKNOWN, not zero). */
  plannedValueKnown: boolean;
  earnedValue: number; // Calculated: plannedValue * (progress / 100)
  actualCost: number; // Sum of actual approved invoices/expenses
  progress: number; // 0 to 100
  /** The BOQ (measured) item that drives this work package's progress. When set, the Progress Engine
   * syncs progress = the item's physical % complete (installed / BOQ) from the Quantity Ledger. */
  boqItemId: Id | null;
  status: WbsNodeStatus;
  createdAt: string;
}

export interface NewWbsNode {
  tenantId: Id;
  projectId: Id;
  parentId?: Id | null;
  code: string;
  title: string;
  plannedValue?: number;
  actualCost?: number;
  progress?: number;
  boqItemId?: Id | null;
  status?: WbsNodeStatus;
}

export function makeWbsNode(input: NewWbsNode): WbsNode {
  const plannedValueKnown = input.plannedValue !== undefined && Number.isFinite(input.plannedValue);
  const planned = plannedValueKnown ? Number(input.plannedValue) : 0;
  const progress = Number.isFinite(input.progress) ? Number(input.progress) : 0;
  const actual = Number.isFinite(input.actualCost) ? Number(input.actualCost) : 0;

  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    plannedValue: planned,
    plannedValueKnown,
    earnedValue: Number((planned * (progress / 100)).toFixed(2)),
    actualCost: actual,
    progress: Math.min(100, Math.max(0, progress)),
    boqItemId: input.boqItemId ?? null,
    status: input.status ?? 'pending',
    createdAt: new Date().toISOString(),
  };
}

export interface EvmMetrics {
  /** Approved opening BAC; not a time-phased PV. */
  budgetAtCompletion: number | null;
  /** True planned value as-of a status date; unavailable until time-phased baseline exists. */
  plannedValue: number | null;
  earnedValue: number | null;
  actualCost: number | null;
  costVariance: number | null;
  scheduleVariance: number | null;
  cpi: number | null; // Cost Performance Index: EV / AC
  spi: number | null; // Schedule Performance Index: EV / PV
  plannedValueStatus: 'available' | 'unavailable';
}

/**
 * Calculates EVM metrics. The three-argument form is retained for legacy callers where the
 * first argument was a real PV. Baseline-aware callers must pass the fourth argument explicitly
 * (null when time-phased PV is unavailable) so BAC is never mislabeled as PV.
 */
export function calculateEvm(pv: number, ev: number, ac: number): EvmMetrics;
export function calculateEvm(bac: number | null, ev: number | null, ac: number | null, pv: number | null): EvmMetrics;
export function calculateEvm(bac: number | null, ev: number | null, ac: number | null, pv?: number | null): EvmMetrics {
  const effectivePv = pv === undefined ? bac : pv;
  const cv = ev !== null && ac !== null ? Number((ev - ac).toFixed(2)) : null;
  const sv = ev !== null && effectivePv !== null ? Number((ev - effectivePv).toFixed(2)) : null;
  const cpi = ev !== null && ac !== null && ac > 0 ? Number((ev / ac).toFixed(2)) : null;
  const spi = ev !== null && effectivePv !== null && effectivePv > 0 ? Number((ev / effectivePv).toFixed(2)) : null;

  return {
    budgetAtCompletion: bac,
    plannedValue: effectivePv,
    earnedValue: ev,
    actualCost: ac,
    costVariance: cv,
    scheduleVariance: sv,
    cpi,
    spi,
    plannedValueStatus: effectivePv === null ? 'unavailable' : 'available',
  };
}
