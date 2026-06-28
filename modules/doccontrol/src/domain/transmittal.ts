import { randomUUID } from 'node:crypto';

export interface Transmittal {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName: string | null;
  sender: string | null;
  recipient: string | null;
  status: 'draft' | 'sent' | 'received' | 'acknowledged';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewTransmittal {
  tenantId: string;
  companyId?: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName?: string | null;
  sender?: string | null;
  recipient?: string | null;
  status?: Transmittal['status'];
  ownerId?: string | null;
  createdBy?: string | null;
}

export function makeTransmittal(input: NewTransmittal): Transmittal {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    sender: input.sender ?? null,
    recipient: input.recipient ?? null,
    status: input.status ?? 'draft',
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
