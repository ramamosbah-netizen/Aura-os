import { type Id, newId } from '@aura/shared';

export type SubmittalType = 'material' | 'technical' | 'sample' | 'drawing';
export type SubmittalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface Submittal {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  submittalType: SubmittalType;
  status: SubmittalStatus;
  projectId: Id;
  projectName: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSubmittal {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  submittalType: SubmittalType;
  status?: SubmittalStatus;
  projectId: Id;
  projectName?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeSubmittal(input: NewSubmittal): Submittal {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    submittalType: input.submittalType,
    status: input.status ?? 'draft',
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
