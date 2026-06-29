import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  PETTY_CASH_EVENT,
  type PettyCashFund,
  type PettyCashTransaction,
  type PettyCashTxType,
  type PettyCashCategory,
  type NewPettyCashFund,
  makePettyCashFund,
  makePettyCashTransaction,
  applyPettyCashTx,
} from './domain/petty-cash';
import { PETTY_CASH_STORE, type PettyCashFilter, type PettyCashStore } from './petty-cash-store';

/**
 * Petty cash service — imprest floats and their movements. Owns
 * `aura_finance_petty_cash_funds` / `_transactions` and emits `finance.petty_cash.*`.
 */
@Injectable()
export class PettyCashService {
  private readonly logger = new Logger('PettyCash');

  constructor(
    @Inject(PETTY_CASH_STORE) private readonly store: PettyCashStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async createFund(input: NewPettyCashFund): Promise<PettyCashFund> {
    const fund = makePettyCashFund(input);
    await this.store.createFund(fund);
    await this.events.append([
      makeEvent({
        type: PETTY_CASH_EVENT.fundCreated,
        tenantId: fund.tenantId,
        companyId: fund.companyId,
        actorId: fund.createdBy,
        aggregateType: 'finance.petty_cash',
        aggregateId: fund.id,
        payload: { name: fund.name, openingFloat: fund.balance },
      }),
    ]);
    this.logger.log(`Petty cash fund created: ${fund.name} (float ${fund.balance})`);
    return fund;
  }

  /** Record a top-up or expense against a fund, updating its balance. Expenses can't overdraw. */
  async recordTransaction(
    fundId: Id,
    type: PettyCashTxType,
    amount: number,
    transactionDate: string,
    category?: PettyCashCategory,
    description?: string,
  ): Promise<{ fund: PettyCashFund; transaction: PettyCashTransaction }> {
    const fund = await this.store.getFund(fundId);
    if (!fund) throw new Error(`petty cash fund ${fundId} not found`);
    if (fund.status !== 'active') throw new Error('cannot transact on a closed fund');

    const balanceAfter = applyPettyCashTx(fund.balance, type, amount);
    const transaction = makePettyCashTransaction({ tenantId: fund.tenantId, fundId, type, amount, category, description, transactionDate }, balanceAfter);
    const updated: PettyCashFund = { ...fund, balance: balanceAfter };

    await this.store.updateFund(updated);
    await this.store.addTransaction(transaction);
    await this.events.append([
      makeEvent({
        type: PETTY_CASH_EVENT.txRecorded,
        tenantId: fund.tenantId,
        companyId: fund.companyId,
        actorId: null,
        aggregateType: 'finance.petty_cash',
        aggregateId: fund.id,
        payload: { type, amount: transaction.amount, category: transaction.category, balanceAfter },
      }),
    ]);
    this.logger.log(`Petty cash ${type} ${transaction.amount} on ${fund.name} → balance ${balanceAfter}`);
    return { fund: updated, transaction };
  }

  getFund(id: Id): Promise<PettyCashFund | null> {
    return this.store.getFund(id);
  }

  async getFundWithTransactions(id: Id): Promise<{ fund: PettyCashFund; transactions: PettyCashTransaction[] } | null> {
    const fund = await this.store.getFund(id);
    if (!fund) return null;
    return { fund, transactions: await this.store.listTransactions(id) };
  }

  listFunds(filter?: PettyCashFilter): Promise<PettyCashFund[]> {
    return this.store.listFunds(filter);
  }
}
