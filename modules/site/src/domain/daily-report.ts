import { randomUUID } from 'node:crypto';

export interface DailyReport {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string; // YYYY-MM-DD
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: 'draft' | 'submitted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDailyReport {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  date: string;
  workDescription: string;
  manpowerCount?: number;
  equipmentCount?: number;
  status?: DailyReport['status'];
  createdBy?: string | null;
}

export function makeDailyReport(input: NewDailyReport): DailyReport {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    date: input.date,
    workDescription: input.workDescription.trim(),
    manpowerCount: input.manpowerCount ?? 0,
    equipmentCount: input.equipmentCount ?? 0,
    status: input.status ?? 'draft',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
