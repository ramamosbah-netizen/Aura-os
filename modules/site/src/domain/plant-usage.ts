import { randomUUID } from 'node:crypto';
import { moneyNumber as r2 } from '@aura/shared';

// Site domain — framework-free. A PlantUsage records a plant/equipment item working on a project
// for a number of hours at an hourly rate (owned-fleet internal hire rate or external hire cost).
// hours × rate = the plant cost charged to the project's CBS cost line via the Transaction Engine.

// The registers a plant item's identity can live in. A subset of §22's ResourceType — labour and
// pools are not plant — deliberately re-declared here rather than imported, so Site stays free of a
// cross-module edge to Projects (ADR-0004). The vocabulary is shared; the dependency is not.
export type PlantResourceType = 'asset' | 'vehicle';
const PLANT_RESOURCE_TYPES: readonly PlantResourceType[] = ['asset', 'vehicle'];

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
  /** The plant/equipment description or asset code (e.g. "Tower Crane TC-01", "JCB 3CX"). Kept as the
   * human label; it is NOT the lineage — "TC-01" and "Tower Crane TC-01" are one crane, not two. */
  equipment: string;
  /**
   * Stable lineage to the resource actually used (AURA-PM-002). Mirrors §22 `ResourceRef`'s stored
   * form — a type plus the id in the OWNING register — so a day's usage can be matched deterministically
   * against the booking that planned it. `asset` → Assets `Asset`, `vehicle` → Fleet `Vehicle`.
   * Both null for usage logged without a registered resource (still valid); both-or-neither otherwise.
   */
  resourceType: PlantResourceType | null;
  /** The id in the owning register (Assets/Fleet). Never a name, code, plate or serial. */
  resourceId: string | null;
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
  resourceType?: PlantResourceType | null;
  resourceId?: string | null;
  hours: number;
  rate?: number;
  notes?: string | null;
  createdBy?: string | null;
}


export function makePlantUsage(input: NewPlantUsage): PlantUsage {
  if (!input.equipment || !input.equipment.trim()) throw new Error('equipment is required');
  const now = new Date().toISOString();
  const hours = Number(input.hours) || 0;
  const rate = Math.max(0, Number(input.rate) || 0);
  // Lineage is both-or-neither: a type without an id matches nothing, and an id without a type is
  // ambiguous between the asset and fleet registers. A partial reference is rejected, not stored.
  const resourceType = input.resourceType ?? null;
  const resourceId = input.resourceId?.trim() || null;
  if ((resourceType === null) !== (resourceId === null)) {
    throw new Error('a plant resource reference requires both a type and an id, or neither');
  }
  if (resourceType !== null && !PLANT_RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`unknown plant resource type: ${resourceType}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    date: input.date.slice(0, 10),
    equipment: input.equipment.trim(),
    resourceType,
    resourceId,
    hours,
    rate,
    cost: r2(hours * rate),
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
