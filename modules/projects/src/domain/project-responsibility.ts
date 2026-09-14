import { type Id, newId } from '@aura/shared';

/** Operational ownership inside a project. Access grants remain in AccessService. */
export const PROJECT_RESPONSIBILITY_WORKSTREAMS = [
  'project_management',
  'engineering_release',
  'planning',
  'procurement',
  'site_execution',
  'commercial',
  'quality',
  'hse',
  'commissioning',
  'handover',
] as const;

export type ProjectResponsibilityWorkstream = (typeof PROJECT_RESPONSIBILITY_WORKSTREAMS)[number];
export type ProjectResponsibilityStatus = 'assigned' | 'accepted' | 'in_progress' | 'completed';

export interface ProjectResponsibility {
  id: Id;
  tenantId: Id;
  projectId: Id;
  workstream: ProjectResponsibilityWorkstream;
  title: string;
  description: string | null;
  assigneeId: Id;
  assignedBy: Id;
  dueDate: string | null;
  status: ProjectResponsibilityStatus;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProjectResponsibility {
  tenantId: Id;
  projectId: Id;
  workstream: ProjectResponsibilityWorkstream;
  title: string;
  description?: string | null;
  assigneeId: Id;
  assignedBy: Id;
  dueDate?: string | null;
}

export function makeProjectResponsibility(input: NewProjectResponsibility): ProjectResponsibility {
  if (!input.projectId) throw new Error('projectId is required');
  if (!PROJECT_RESPONSIBILITY_WORKSTREAMS.includes(input.workstream)) throw new Error('unknown responsibility workstream');
  if (!input.title?.trim()) throw new Error('responsibility title is required');
  if (!input.assigneeId) throw new Error('assigneeId is required');
  if (!input.assignedBy) throw new Error('assignedBy is required');
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error('dueDate must be YYYY-MM-DD');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    workstream: input.workstream,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    assigneeId: input.assigneeId,
    assignedBy: input.assignedBy,
    dueDate: input.dueDate ?? null,
    status: 'assigned',
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function at(status: ProjectResponsibilityStatus, value: ProjectResponsibility): ProjectResponsibility {
  const now = new Date().toISOString();
  if (status === 'accepted' && value.status !== 'assigned') throw new Error(`cannot accept responsibility from ${value.status}`);
  if (status === 'in_progress' && !['assigned', 'accepted'].includes(value.status)) throw new Error(`cannot start responsibility from ${value.status}`);
  if (status === 'completed' && value.status !== 'in_progress') throw new Error(`cannot complete responsibility from ${value.status}`);
  return {
    ...value,
    status,
    acceptedAt: status === 'accepted' || status === 'in_progress' ? value.acceptedAt ?? now : value.acceptedAt,
    startedAt: status === 'in_progress' ? value.startedAt ?? now : value.startedAt,
    completedAt: status === 'completed' ? now : value.completedAt,
    updatedAt: now,
  };
}

export const acceptProjectResponsibility = (value: ProjectResponsibility): ProjectResponsibility => at('accepted', value);
export const startProjectResponsibility = (value: ProjectResponsibility): ProjectResponsibility => at('in_progress', value);
export const completeProjectResponsibility = (value: ProjectResponsibility): ProjectResponsibility => at('completed', value);
