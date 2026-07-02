import type { Id, Page, PageParams } from '@aura/shared';
import type { BankTransaction, BankTransactionStatus } from './domain/bank-transaction';

export const BANK_TRANSACTION_STORE = Symbol('BANK_TRANSACTION_STORE');

export interface BankTransactionFilter {
  tenantId?: string;
  bankAccountId?: string;
  status?: BankTransactionStatus;
  limit?: number;
}

export interface BankTransactionStore {
  create(tx: BankTransaction): Promise<void>;
  update(tx: BankTransaction): Promise<void>;
  get(id: Id): Promise<BankTransaction | null>;
  list(filter?: BankTransactionFilter): Promise<BankTransaction[]>;
  listPaged(filter: BankTransactionFilter, page: PageParams): Promise<Page<BankTransaction>>;
}
