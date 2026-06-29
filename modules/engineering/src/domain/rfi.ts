import { type Id, newId } from '@aura/shared';

export type RfiStatus = 'open' | 'answered' | 'closed';

export interface Rfi {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  question: string;
  answer: string | null;
  status: RfiStatus;
  projectId: Id;
  projectName: string | null;
  assignedTo: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewRfi {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  question: string;
  status?: RfiStatus;
  projectId: Id;
  projectName?: string | null;
  assignedTo?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeRfi(input: NewRfi): Rfi {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    question: input.question.trim(),
    answer: null,
    status: input.status ?? 'open',
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    assignedTo: input.assignedTo ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
