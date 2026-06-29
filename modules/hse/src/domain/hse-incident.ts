import { randomUUID } from 'node:crypto';

export interface HseIncident {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  severity: 'near_miss' | 'minor' | 'major' | 'fatal';
  description: string;
  locationDetail: string;
  status: 'reported' | 'investigating' | 'closed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewHseIncident {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  severity: HseIncident['severity'];
  description: string;
  locationDetail: string;
  status?: HseIncident['status'];
  createdBy?: string | null;
}

export function makeHseIncident(input: NewHseIncident): HseIncident {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date,
    severity: input.severity,
    description: input.description.trim(),
    locationDetail: input.locationDetail.trim(),
    status: input.status ?? 'reported',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
