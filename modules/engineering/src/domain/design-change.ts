import { type Id, newId } from '@aura/shared';
import { type Discipline, toDiscipline } from './discipline';

// Engineering domain — framework-free. A Design Change is an engineering-originated change to the
// design (a revised detail, a value-engineering proposal, a site-driven redesign). It is owned by
// Engineering, but when approved WITH a cost impact it is the trigger for a commercial Variation —
// which is owned by Projects. Per ADR-0011 the two never share a table: an approved design change
// EMITS `engineering.design_change.approved`; the cross-module reactor creates the draft Variation.
//
// changeType mirrors the variation vocabulary so the reactor maps straight through:
//   addition = extra scope / +value ; omission = descoped work / −value.

export type DesignChangeStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type DesignChangeType = 'addition' | 'omission';

export interface DesignChange {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  description: string | null;
  discipline: Discipline;
  changeType: DesignChangeType;
  /** Whether this change carries a commercial cost impact (drives Variation creation on approval). */
  costImpact: boolean;
  /** Estimated magnitude of the cost impact (positive); the reactor uses it as the Variation amount. */
  estimatedValue: number;
  status: DesignChangeStatus;
  projectId: Id;
  projectName: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  decidedBy: Id | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDesignChange {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  description?: string | null;
  discipline?: Discipline;
  changeType?: DesignChangeType;
  costImpact?: boolean;
  estimatedValue?: number;
  status?: DesignChangeStatus;
  projectId: Id;
  projectName?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeDesignChange(input: NewDesignChange): DesignChange {
  const now = new Date().toISOString();
  const estimated = Number(input.estimatedValue) || 0;
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    discipline: toDiscipline(input.discipline),
    changeType: input.changeType ?? 'addition',
    costImpact: input.costImpact ?? false,
    estimatedValue: estimated < 0 ? 0 : estimated,
    status: input.status ?? 'draft',
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a design change to a decided/interim status, stamping the decider on approve/reject. */
export function decideDesignChange(dc: DesignChange, status: DesignChangeStatus, actorId: Id | null): DesignChange {
  const decided = status === 'approved' || status === 'rejected';
  return {
    ...dc,
    status,
    decidedBy: decided ? (actorId ?? dc.decidedBy) : dc.decidedBy,
    decidedAt: decided ? new Date().toISOString() : dc.decidedAt,
    updatedAt: new Date().toISOString(),
  };
}

/** True when an approved design change should spawn a commercial Variation. */
export function triggersVariation(dc: DesignChange): boolean {
  return dc.status === 'approved' && dc.costImpact && dc.estimatedValue > 0;
}

export const DESIGN_CHANGE_EVENT = {
  raised: 'engineering.design_change.raised',
  approved: 'engineering.design_change.approved',
  rejected: 'engineering.design_change.rejected',
} as const;
