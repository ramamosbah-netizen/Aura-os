import type { Id } from '@aura/shared';
import type { ContractRevision } from './domain/contract-revision';
export const CONTRACT_REVISION_STORE = Symbol('CONTRACT_REVISION_STORE');
export interface ContractRevisionStore { create(r: ContractRevision): Promise<void>; get(id: Id): Promise<ContractRevision | null>; list(tenantId: Id, contractId: Id): Promise<ContractRevision[]>; update(r: ContractRevision): Promise<void>; }
