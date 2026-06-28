import { randomUUID } from 'node:crypto';

export interface CapaAction {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  sourceType: 'incident' | 'audit' | 'inspection';
  sourceId: string | null;
  actionRequired: string;
  assignedTo: string | null;
  dueDate: string; // YYYY-MM-DD
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCapaAction {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  sourceType: CapaAction['sourceType'];
  sourceId?: string | null;
  actionRequired: string;
  assignedTo?: string | null;
  dueDate: string;
  status?: CapaAction['status'];
  createdBy?: string | null;
}

export function makeCapaAction(input: NewCapaAction): CapaAction {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    actionRequired: input.actionRequired.trim(),
    assignedTo: input.assignedTo ?? null,
    dueDate: input.dueDate,
    status: input.status ?? 'pending',
    completedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
