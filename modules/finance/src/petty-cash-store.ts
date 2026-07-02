import type { Id, Page, PageParams } from '@aura/shared';
import type { PettyCashFund, PettyCashTransaction } from './domain/petty-cash';

export const PETTY_CASH_STORE = Symbol('PETTY_CASH_STORE');

export interface PettyCashFilter {
  tenantId?: string;
  limit?: number;
}

export interface PettyCashStore {
  createFund(fund: PettyCashFund): Promise<void>;
  updateFund(fund: PettyCashFund): Promise<void>;
  getFund(id: Id): Promise<PettyCashFund | null>;
  listFunds(filter?: PettyCashFilter): Promise<PettyCashFund[]>;
  listFundsPaged(filter: PettyCashFilter, page: PageParams): Promise<Page<PettyCashFund>>;
  addTransaction(tx: PettyCashTransaction): Promise<void>;
  listTransactions(fundId: Id): Promise<PettyCashTransaction[]>;
}
