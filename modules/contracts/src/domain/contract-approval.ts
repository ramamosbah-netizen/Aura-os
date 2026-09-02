import { type Id, newId } from '@aura/shared';

export type ContractApprovalTarget = 'revision' | 'amendment';
export type ContractApprovalStatus = 'pending' | 'approved' | 'returned' | 'rejected';

export interface ContractApproval {
  id: Id; tenantId: Id; contractId: Id; target: ContractApprovalTarget; targetId: Id;
  submittedBy: Id | null; submittedAt: string; status: ContractApprovalStatus;
  decidedBy: Id | null; decidedAt: string | null; comment: string | null;
}

export interface NewContractApproval { tenantId: Id; contractId: Id; target: ContractApprovalTarget; targetId: Id; submittedBy: Id | null; }

export function makeContractApproval(input: NewContractApproval): ContractApproval {
  return { id: newId(), tenantId: input.tenantId, contractId: input.contractId, target: input.target,
    targetId: input.targetId, submittedBy: input.submittedBy, submittedAt: new Date().toISOString(),
    status: 'pending', decidedBy: null, decidedAt: null, comment: null };
}
