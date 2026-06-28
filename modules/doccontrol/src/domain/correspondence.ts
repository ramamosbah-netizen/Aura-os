import { randomUUID } from 'node:crypto';

export interface Correspondence {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  subject: string;
  projectId: string;
  projectName: string | null;
  direction: 'inbound' | 'outbound';
  sender: string | null;
  recipient: string | null;
  status: 'logged' | 'pending_review' | 'closed';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCorrespondence {
  tenantId: string;
  companyId?: string | null;
  code: string;
  subject: string;
  projectId: string;
  projectName?: string | null;
  direction: Correspondence['direction'];
  sender?: string | null;
  recipient?: string | null;
  status?: Correspondence['status'];
  ownerId?: string | null;
  createdBy?: string | null;
}

export function makeCorrespondence(input: NewCorrespondence): Correspondence {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    subject: input.subject.trim(),
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    direction: input.direction,
    sender: input.sender ?? null,
    recipient: input.recipient ?? null,
    status: input.status ?? 'logged',
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
