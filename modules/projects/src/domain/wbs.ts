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
  earnedValue: number; // Calculated: plannedValue * (progress / 100)
  actualCost: number; // Sum of actual approved invoices/expenses
  progress: number; // 0 to 100
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
  status?: WbsNodeStatus;
}

export function makeWbsNode(input: NewWbsNode): WbsNode {
  const planned = Number.isFinite(input.plannedValue) ? Number(input.plannedValue) : 0;
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
    earnedValue: Number((planned * (progress / 100)).toFixed(2)),
    actualCost: actual,
    progress: Math.min(100, Math.max(0, progress)),
    status: input.status ?? 'pending',
    createdAt: new Date().toISOString(),
  };
}

export interface EvmMetrics {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  cpi: number; // Cost Performance Index: EV / AC
  spi: number; // Schedule Performance Index: EV / PV
}

export function calculateEvm(pv: number, ev: number, ac: number): EvmMetrics {
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? Number((ev / ac).toFixed(2)) : 1.0;
  const spi = pv > 0 ? Number((ev / pv).toFixed(2)) : 1.0;

  return {
    plannedValue: pv,
    earnedValue: ev,
    actualCost: ac,
    costVariance: cv,
    scheduleVariance: sv,
    cpi,
    spi,
  };
}
