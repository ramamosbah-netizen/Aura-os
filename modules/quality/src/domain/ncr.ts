import { randomUUID } from 'node:crypto';

export interface Ncr {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  proposedCorrection: string | null;
  severity: 'minor' | 'major';
  status: 'raised' | 'corrected' | 'closed';
  raisedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewNcr {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  ncrNumber: string;
  description: string;
  rootCause?: string | null;
  proposedCorrection?: string | null;
  severity: Ncr['severity'];
  status?: Ncr['status'];
  raisedBy?: string | null;
  assignedTo?: string | null;
}

export function makeNcr(input: NewNcr): Ncr {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ncrNumber: input.ncrNumber.trim(),
    description: input.description.trim(),
    rootCause: input.rootCause ?? null,
    proposedCorrection: input.proposedCorrection ?? null,
    severity: input.severity,
    status: input.status ?? 'raised',
    raisedBy: input.raisedBy ?? null,
    assignedTo: input.assignedTo ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
