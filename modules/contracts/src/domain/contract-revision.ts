import { type Id, newId } from '@aura/shared';

export type ContractRevisionStatus = 'draft' | 'internal_review' | 'client_review' | 'negotiation' | 'approved' | 'signed' | 'returned' | 'rejected' | 'superseded';

export interface ContractRevisionClause {
  id: Id; revisionId: Id; sourceClauseId: Id | null; sourceClauseRevision: number | null;
  code: string; title: string; category: string; body: string; createdAt: string;
}

export interface ContractRevision {
  id: Id; tenantId: Id; contractId: Id; revisionNumber: number; parentRevisionId: Id | null;
  status: ContractRevisionStatus; revisionReason: string | null; terms: Record<string, unknown>;
  clauses: ContractRevisionClause[]; createdBy: Id | null; createdAt: string; approvedBy: Id | null;
  approvedAt: string | null; signedBy: Id | null; signedAt: string | null;
}

export interface NewContractRevision {
  tenantId: Id; contractId: Id; parentRevisionId?: Id | null; revisionNumber?: number;
  revisionReason?: string | null; terms?: Record<string, unknown>; clauses?: ContractRevisionClause[];
  createdBy?: Id | null;
}

const NEXT: Record<ContractRevisionStatus, readonly ContractRevisionStatus[]> = {
  draft: ['internal_review', 'client_review', 'superseded'],
  internal_review: ['client_review', 'negotiation', 'returned', 'rejected'],
  client_review: ['negotiation', 'internal_review', 'returned', 'rejected'],
  negotiation: ['internal_review', 'client_review', 'approved', 'returned', 'rejected'],
  approved: ['signed', 'superseded'],
  signed: [], returned: ['draft'], rejected: [], superseded: [],
};

export function assertRevisionTransition(from: ContractRevisionStatus, to: ContractRevisionStatus): void {
  if (from === to) return;
  if (!NEXT[from].includes(to)) throw new Error(`invalid contract revision transition: ${from} → ${to}`);
}

export function makeContractRevision(input: NewContractRevision): ContractRevision {
  const revisionNumber = input.revisionNumber ?? 1;
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) throw new Error('revision number must be a positive integer');
  const revisionId = newId();
  const createdAt = new Date().toISOString();
  return {
    id: revisionId, tenantId: input.tenantId, contractId: input.contractId, revisionNumber,
    parentRevisionId: input.parentRevisionId ?? null, status: 'draft', revisionReason: input.revisionReason?.trim() || null,
    terms: { ...(input.terms ?? {}) }, clauses: (input.clauses ?? []).map((c) => ({ ...c, id: newId(), revisionId, createdAt: c.createdAt || createdAt })),
    createdBy: input.createdBy ?? null, createdAt, approvedBy: null, approvedAt: null, signedBy: null, signedAt: null,
  };
}

export function signedRevision(r: ContractRevision, actorId: Id): ContractRevision {
  if (!actorId) throw new Error('signed revision requires a signatory');
  assertRevisionTransition(r.status, 'signed');
  return { ...r, status: 'signed', signedBy: actorId, signedAt: new Date().toISOString() };
}
