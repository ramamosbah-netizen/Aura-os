import { randomUUID } from 'node:crypto';

// Site domain — framework-free. A PlantUsage records a plant/equipment item working on a project
// for a number of hours at an hourly rate (owned-fleet internal hire rate or external hire cost).
// hours × rate = the plant cost charged to the project's CBS cost line via the Transaction Engine.

export interface PlantUsage {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  /** CBS cost line this plant is charged to. When set (with a rate), the Transaction Engine posts
   * the plant cost as ACTUAL against it. Nullable + additive. */
  cbsNodeId: string | null;
  date: string; // YYYY-MM-DD
  /** The plant/equipment description or asset code (e.g. "Tower Crane TC-01", "JCB 3CX"). */
  equipment: string;
  hours: number;
  /** Hourly plant rate (internal hire or external cost). 0 = untracked → no cost posts. */
  rate: number;
  /** Derived plant cost for this record: hours × rate. */
  cost: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPlantUsage {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  cbsNodeId?: string | null;
  date: string;
  equipment: string;
  hours: number;
  rate?: number;
  notes?: string | null;
  createdBy?: string | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function makePlantUsage(input: NewPlantUsage): PlantUsage {
  if (!input.equipment || !input.equipment.trim()) throw new Error('equipment is required');
  const now = new Date().toISOString();
  const hours = Number(input.hours) || 0;
  const rate = Math.max(0, Number(input.rate) || 0);
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    date: input.date.slice(0, 10),
    equipment: input.equipment.trim(),
    hours,
    rate,
    cost: r2(hours * rate),
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
