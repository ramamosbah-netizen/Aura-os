import type { Id } from '@aura/shared';
import type { ContractApproval, ContractApprovalStatus } from './domain/contract-approval';
export const CONTRACT_APPROVAL_STORE = Symbol('CONTRACT_APPROVAL_STORE');
export interface ContractApprovalStore {
  get(tenantId: Id, target: ContractApproval['target'], targetId: Id): Promise<ContractApproval | null>;
  create(a: ContractApproval): Promise<void>;
  decide(a: ContractApproval, status: ContractApprovalStatus, actorId: Id, comment?: string): Promise<ContractApproval>;
}
