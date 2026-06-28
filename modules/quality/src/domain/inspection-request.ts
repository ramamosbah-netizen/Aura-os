import { randomUUID } from 'node:crypto';

export interface InspectionRequest {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string; // YYYY-MM-DD
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewInspectionRequest {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  irNumber: string;
  discipline: InspectionRequest['discipline'];
  locationDetail: string;
  inspectionDate: string;
  status?: InspectionRequest['status'];
  inspectedBy?: string | null;
  comments?: string | null;
}

export function makeInspectionRequest(input: NewInspectionRequest): InspectionRequest {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    irNumber: input.irNumber.trim(),
    discipline: input.discipline,
    locationDetail: input.locationDetail.trim(),
    inspectionDate: input.inspectionDate,
    status: input.status ?? 'requested',
    inspectedBy: input.inspectedBy ?? null,
    comments: input.comments ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
