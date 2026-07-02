import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { type BankTransaction, type BankTransactionStatus, makeBankTransaction } from './domain/bank-transaction';
import { BANK_TRANSACTION_STORE, type BankTransactionStore } from './bank-transaction-store';
import { PAYMENT_STORE, type PaymentStore } from './payment-store';

@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger('BankReconciliation');

  constructor(
    @Inject(BANK_TRANSACTION_STORE) private readonly txStore: BankTransactionStore,
    @Inject(PAYMENT_STORE) private readonly paymentStore: PaymentStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async importStatement(
    tenantId: Id,
    bankAccountId: Id,
    txs: Array<{ transactionDate: string; amount: number; description: string; reference?: string | null }>,
  ): Promise<BankTransaction[]> {
    const imported: BankTransaction[] = [];
    for (const raw of txs) {
      const tx = makeBankTransaction({
        tenantId,
        bankAccountId,
        transactionDate: raw.transactionDate,
        amount: raw.amount,
        description: raw.description,
        reference: raw.reference,
      });
      await this.txStore.create(tx);
      imported.push(tx);
    }

    this.logger.log(`Imported ${imported.length} bank transactions for bank account ${bankAccountId}`);
    return imported;
  }

  async listTransactions(tenantId: Id, bankAccountId: Id, status?: BankTransactionStatus): Promise<BankTransaction[]> {
    return this.txStore.list({ tenantId, bankAccountId, status });
  }

  async listTransactionsPaged(tenantId: Id, bankAccountId: Id, page: PageParams, status?: BankTransactionStatus): Promise<Page<BankTransaction>> {
    return this.txStore.listPaged({ tenantId, bankAccountId, status }, page);
  }

  async autoMatch(tenantId: Id, bankAccountId: Id): Promise<Array<{ transactionId: Id; paymentId: Id; amount: number }>> {
    const unreconciled = await this.txStore.list({ tenantId, bankAccountId, status: 'unreconciled' });
    const payments = await this.paymentStore.list({ tenantId });
    
    // Filter payments for this specific bankAccountId (some stores may not support filtering, so we do in-memory filter)
    const matchingPayments = payments.filter(p => p.bankAccountId === bankAccountId);

    const matches: Array<{ transactionId: Id; paymentId: Id; amount: number }> = [];

    for (const tx of unreconciled) {
      // Find payments that have matching absolute amount (positive/negative sign could differ depending on debit/credit view)
      const matchesForTx = matchingPayments.filter((pm) => {
        const amountMatch = Math.abs(tx.amount) === Math.abs(pm.amount);
        if (!amountMatch) return false;

        // Check if transaction dates are within 7 days of each other
        const txDate = new Date(tx.transactionDate).getTime();
        const pmDate = new Date(pm.paidAt).getTime();
        const diffDays = Math.abs(txDate - pmDate) / (1000 * 60 * 60 * 24);
        
        return diffDays <= 7;
      });

      // If exactly one unique match is found, auto-reconcile it
      if (matchesForTx.length === 1) {
        const pm = matchesForTx[0];
        
        tx.status = 'matched';
        tx.reconciledPaymentId = pm.id;
        await this.txStore.update(tx);

        matches.push({
          transactionId: tx.id,
          paymentId: pm.id,
          amount: tx.amount,
        });

        await this.events.append([
          makeEvent({
            type: 'finance.bank_reconciliation.matched',
            tenantId: tx.tenantId,
            companyId: null,
            actorId: null,
            aggregateType: 'finance.bank_transaction',
            aggregateId: tx.id,
            payload: {
              paymentId: pm.id,
              amount: tx.amount,
              method: 'auto',
            },
          }),
        ]);
      }
    }

    this.logger.log(`Auto-matched ${matches.length} bank transactions`);
    return matches;
  }

  async reconcileManually(tenantId: Id, transactionId: Id, paymentId: Id, actorId?: Id): Promise<BankTransaction> {
    const tx = await this.txStore.get(transactionId);
    if (!tx) throw new Error(`Bank transaction ${transactionId} not found`);
    if (tx.tenantId !== tenantId) throw new Error(`Access denied`);

    const payment = await this.paymentStore.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (payment.tenantId !== tenantId) throw new Error(`Access denied`);

    tx.status = 'manual';
    tx.reconciledPaymentId = payment.id;
    await this.txStore.update(tx);

    await this.events.append([
      makeEvent({
        type: 'finance.bank_reconciliation.matched',
        tenantId: tx.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.bank_transaction',
        aggregateId: tx.id,
        payload: {
          paymentId: payment.id,
          amount: tx.amount,
          method: 'manual',
        },
      }),
    ]);

    this.logger.log(`Manually reconciled bank transaction ${transactionId} with payment ${paymentId}`);
    return tx;
  }

  async unreconcile(tenantId: Id, transactionId: Id, actorId?: Id): Promise<BankTransaction> {
    const tx = await this.txStore.get(transactionId);
    if (!tx) throw new Error(`Bank transaction ${transactionId} not found`);
    if (tx.tenantId !== tenantId) throw new Error(`Access denied`);

    tx.status = 'unreconciled';
    tx.reconciledPaymentId = null;
    await this.txStore.update(tx);

    await this.events.append([
      makeEvent({
        type: 'finance.bank_reconciliation.unreconciled',
        tenantId: tx.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.bank_transaction',
        aggregateId: tx.id,
        payload: {},
      }),
    ]);

    this.logger.log(`Unreconciled bank transaction ${transactionId}`);
    return tx;
  }
}
