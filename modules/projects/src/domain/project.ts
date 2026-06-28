import { type Id, newId } from '@aura/shared';

// Projects domain — framework-free. A Project is the delivery/execution of a signed
// contract: the final link in the deal chain (CRM → Tender → Contract → Project). It
// REFERENCES the source contract AND the CRM account by id + name snapshots — the chain
// arrives at delivery still by reference, never a DB join.

export type ProjectStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface Project {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The signed contract this project delivers — reference + snapshot. */
  contractId: Id | null;
  contractTitle: string | null;
  /** The CRM account (client), carried down the chain — reference + snapshot. */
  accountId: Id | null;
  accountName: string | null;
  status: ProjectStatus;
  /** Project budget (carried from the contract value). */
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewProject {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  contractId?: Id | null;
  contractTitle?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: ProjectStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeProject(input: NewProject): Project {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    contractId: input.contractId ?? null,
    contractTitle: input.contractTitle ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'planned',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Projects events on the spine. */
export const PROJECT_EVENT = {
  created: 'projects.project.created',
  updated: 'projects.project.updated',
  started: 'projects.project.started',
  completed: 'projects.project.completed',
  costCommitted: 'projects.cost.committed',
  costActual: 'projects.cost.actual',
  budgetOverrun: 'projects.budget.overrun',
} as const;
