import { randomUUID } from 'node:crypto';

export interface PermitToWork {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  permitType: 'hot_work' | 'confined_space' | 'height_work' | 'electrical' | 'excavation';
  validFrom: string; // ISO String
  validTo: string; // ISO String
  description: string;
  status: 'draft' | 'requested' | 'approved' | 'expired' | 'closed';
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPermitToWork {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  permitType: PermitToWork['permitType'];
  validFrom: string;
  validTo: string;
  description: string;
  status?: PermitToWork['status'];
  createdBy?: string | null;
}

export function makePermitToWork(input: NewPermitToWork): PermitToWork {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    permitType: input.permitType,
    validFrom: input.validFrom,
    validTo: input.validTo,
    description: input.description.trim(),
    status: input.status ?? 'requested',
    approvedBy: null,
    approvedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
