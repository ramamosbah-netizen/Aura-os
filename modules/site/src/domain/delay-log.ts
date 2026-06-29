import { randomUUID } from 'node:crypto';

export interface DelayLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  delayType: 'weather' | 'material' | 'access' | 'drawings' | 'other';
  description: string;
  impactHours: number;
  status: 'logged' | 'resolved';
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDelayLog {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  delayType: DelayLog['delayType'];
  description: string;
  impactHours?: number;
  status?: DelayLog['status'];
  createdBy?: string | null;
}

export function makeDelayLog(input: NewDelayLog): DelayLog {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date,
    delayType: input.delayType,
    description: input.description.trim(),
    impactHours: input.impactHours ?? 0,
    status: input.status ?? 'logged',
    resolvedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
