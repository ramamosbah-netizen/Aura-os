import { type Id, newId } from '@aura/shared';

export type SubcontractStatus = 'draft' | 'active' | 'closed';

export interface Subcontract {
  id: Id;
  tenantId: Id;
  projectId: Id;
  projectName: string | null;
  title: string;
  subcontractorName: string;
  status: SubcontractStatus;
  value: number;
  retentionPercentage: number; // e.g. 10.0 for 10%
  createdAt: string;
}

export interface NewSubcontract {
  tenantId: Id;
  projectId: Id;
  projectName?: string | null;
  title: string;
  subcontractorName: string;
  status?: SubcontractStatus;
  value: number;
  retentionPercentage?: number;
}

export function makeSubcontract(input: NewSubcontract): Subcontract {
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    title: input.title.trim(),
    subcontractorName: input.subcontractorName.trim(),
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    retentionPercentage: Number.isFinite(input.retentionPercentage) ? Number(input.retentionPercentage) : 10,
    createdAt: new Date().toISOString(),
  };
}

export const SUBCONTRACT_EVENT = {
  created: 'subcontracts.subcontract.created',
  updated: 'subcontracts.subcontract.updated',
  statusChanged: 'subcontracts.subcontract.statusChanged',
} as const;
