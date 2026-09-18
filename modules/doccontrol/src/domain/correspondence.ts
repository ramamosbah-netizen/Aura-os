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
  /** Who closed it, when, and WHY. Closing ends an obligation and it was anonymous and unexplained. */
  closedBy: string | null;
  closedAt: string | null;
  closeReason: string | null;
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
    closedBy: null,
    closedAt: null,
    closeReason: null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * CLOSE the item — which ends an obligation on a project.
 *
 * It recorded nobody, asked for no reason, and had no state guard: closing an already-closed item
 * answered 200, a success reported for an act that did not happen. All three are fixed here.
 */
export function closeCorrespondence(
  c: Correspondence,
  closedBy: string | null = null,
  reason?: string | null,
): Correspondence {
  if (c.status === 'closed') {
    throw new Error(`correspondence ${c.code} is already closed`);
  }
  const trimmed = (reason ?? '').trim();
  if (!trimmed) {
    throw new Error('a reason is required to close correspondence — closing it ends an obligation on this project');
  }
  return {
    ...c,
    status: 'closed',
    closedBy,
    closedAt: new Date().toISOString(),
    closeReason: trimmed,
    updatedAt: new Date().toISOString(),
  };
}
