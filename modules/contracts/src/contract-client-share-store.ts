import type { Id } from '@aura/shared';
import type { ContractClientShare } from './domain/contract-client-share';
export const CONTRACT_CLIENT_SHARE_STORE = Symbol('CONTRACT_CLIENT_SHARE_STORE');
export interface ContractClientShareStore { create(s: ContractClientShare): Promise<void>; get(id: Id): Promise<ContractClientShare|null>; list(tenantId: Id, contractId: Id): Promise<ContractClientShare[]>; update(s: ContractClientShare): Promise<void>; }

