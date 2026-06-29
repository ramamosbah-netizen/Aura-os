import type { Id } from '@aura/shared';
import type { BankGuarantee, GuaranteeStatus } from './domain/bank-guarantee';

export const BANK_GUARANTEE_STORE = Symbol('BANK_GUARANTEE_STORE');

export interface BankGuaranteeFilter {
  tenantId?: string;
  status?: GuaranteeStatus;
  projectId?: string;
  limit?: number;
}

export interface BankGuaranteeStore {
  save(guarantee: BankGuarantee): Promise<void>;
  get(id: Id): Promise<BankGuarantee | null>;
  list(filter?: BankGuaranteeFilter): Promise<BankGuarantee[]>;
}
