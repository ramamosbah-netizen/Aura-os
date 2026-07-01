import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. A ContractObligation is a tracked deliverable / milestone /
// compliance commitment under a contract (e.g. "submit programme within 14 days", "provide
// performance bond", "monthly HSE report"). It references the contract by id + title snapshot and
// drives due-date reminders and breach flagging.

export type ObligationType = 'deliverable' | 'milestone' | 'compliance' | 'payment' | 'insurance' | 'other';
export type ObligationStatus = 'open' | 'in_progress' | 'met' | 'breached' | 'waived';
export type ObligationParty = 'us' | 'client' | 'consultant' | 'subcontractor' | 'other';

export interface ContractObligation {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  contractId: Id;
  contractTitle: string | null;
  title: string;
  description: string | null;
  obligationType: ObligationType;
  responsibleParty: ObligationParty;
  dueDate: string; // YYYY-MM-DD
  status: ObligationStatus;
  completedDate: string | null;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewContractObligation {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  contractTitle?: string | null;
  title: string;
  description?: string | null;
  obligationType?: ObligationType;
  responsibleParty?: ObligationParty;
  dueDate: string;
  status?: ObligationStatus;
  notes?: string | null;
  createdBy?: Id | null;
}

const CLOSED: ObligationStatus[] = ['met', 'waived'];

export function makeContractObligation(input: NewContractObligation): ContractObligation {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    contractId: input.contractId,
    contractTitle: input.contractTitle?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    obligationType: input.obligationType ?? 'deliverable',
    responsibleParty: input.responsibleParty ?? 'us',
    dueDate: input.dueDate.slice(0, 10),
    status: input.status ?? 'open',
    completedDate: null,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Transition an obligation; met/waived stamp the completed date. */
export function setObligationStatus(o: ContractObligation, status: ObligationStatus, on?: string): ContractObligation {
  return {
    ...o,
    status,
    completedDate: CLOSED.includes(status) ? (on ?? new Date().toISOString().slice(0, 10)) : o.completedDate,
    updatedAt: new Date().toISOString(),
  };
}

/** True when an open obligation is past its due date (a breach risk / actual breach). */
export function isOverdue(o: ContractObligation, asOf?: string): boolean {
  if (CLOSED.includes(o.status)) return false;
  const now = asOf ?? new Date().toISOString().slice(0, 10);
  return o.dueDate < now;
}

export const OBLIGATION_EVENT = {
  created: 'contracts.obligation.created',
  statusChanged: 'contracts.obligation.status_changed',
} as const;
