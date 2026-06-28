import { randomUUID } from 'node:crypto';

export interface Snag {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSnag {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  description: string;
  locationDetail: string;
  severity: Snag['severity'];
  status?: Snag['status'];
  assignedTo?: string | null;
  createdBy?: string | null;
}

export function makeSnag(input: NewSnag): Snag {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    description: input.description.trim(),
    locationDetail: input.locationDetail.trim(),
    severity: input.severity,
    status: input.status ?? 'open',
    assignedTo: input.assignedTo ?? null,
    resolvedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
