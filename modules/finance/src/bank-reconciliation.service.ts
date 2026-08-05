import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { type BankTransaction, type BankTransactionStatus, makeBankTransaction } from './domain/bank-transaction';
import { BANK_TRANSACTION_STORE, type BankTransactionStore } from './bank-transaction-store';
import { PAYMENT_STORE, type PaymentStore } from './payment-store';
import { assertSameTenant } from './domain/tenant-guard';

/** Natural key for a bank statement line within its account — the basis for idempotent re-import. */
const bankLineKey = (t: BankTransaction): string =>
  `${t.transactionDate}|${Number(t.amount)}|${(t.reference ?? '').trim().toLowerCase()}|${(t.description ?? '').trim().toLowerCase()}`;

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
    // Idempotent import: re-running the same statement must not double the ledger. Nothing stopped
    // an accountant re-uploading a file — every line landed a second time, and the account read
    // twice its real movement. A line is keyed by (date, amount, reference, description) within its
    // account; one already present is skipped. Genuinely repeated movements are expected to carry
    // distinct references — the reference is what makes a re-import safe.
    const existing = await this.txStore.list({ tenantId, bankAccountId });
    const seen = new Set(existing.map(bankLineKey));
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
      if (seen.has(bankLineKey(tx))) continue; // already imported — skip (idempotent)
      await this.txStore.create(tx);
      imported.push(tx);
    }

    const skipped = txs.length - imported.length;
    this.logger.log(
      `Imported ${imported.length} of ${txs.length} bank transactions for bank account ${bankAccountId}` +
        (skipped ? ` (${skipped} already present)` : ''),
    );
    return imported;
  }

  async listTransactions(tenantId: Id, bankAccountId: Id, status?: BankTransactionStatus): Promise<BankTransaction[]> {
    return this.txStore.list({ tenantId, bankAccountId, status });
  }

  async listTransactionsPaged(tenantId: Id, bankAccountId: Id, page: PageParams, status?: BankTransactionStatus): Promise<Page<BankTransaction>> {
    return this.txStore.listPaged({ tenantId, bankAccountId, status }, page);
  }

  /**
   * Auto-reconcile bank lines against recorded payments.
   *
   * **A payment can only settle ONE bank line.** It used to be matchable against every transaction
   * in the run: the candidate list was never reduced as payments were consumed, and payments
   * already linked to an earlier reconciliation were not excluded either. So a bank statement
   * showing the same 50,000 debit twice, against a single 50,000 payment, matched BOTH lines to
   * that one payment and left nothing unreconciled — the account was 50,000 lighter than the books
   * and the reconciliation reported clean. A duplicate bank debit is the single thing this routine
   * exists to surface, and it was the thing it hid.
   *
   * Amounts are compared to the fils rather than by exact float equality, so a stored 50000.00 and
   * a 49999.999999 that arrived through a rate conversion still reconcile.
   */
  async autoMatch(tenantId: Id, bankAccountId: Id): Promise<Array<{ transactionId: Id; paymentId: Id; amount: number }>> {
    const unreconciled = await this.txStore.list({ tenantId, bankAccountId, status: 'unreconciled' });
    const payments = await this.paymentStore.list({ tenantId });

    // Filter payments for this specific bankAccountId (some stores may not support filtering, so we do in-memory filter)
    const matchingPayments = payments.filter(p => p.bankAccountId === bankAccountId);

    // Payments already tied to a bank line — by an earlier run of this routine or a manual match.
    const allForAccount = await this.txStore.list({ tenantId, bankAccountId });
    const usedPaymentIds = new Set(
      allForAccount.map((t) => t.reconciledPaymentId).filter((id): id is Id => !!id),
    );

    const matches: Array<{ transactionId: Id; paymentId: Id; amount: number }> = [];

    for (const tx of unreconciled) {
      // Find payments that have matching absolute amount (positive/negative sign could differ depending on debit/credit view)
      const matchesForTx = matchingPayments.filter((pm) => {
        if (usedPaymentIds.has(pm.id)) return false; // already settles another line
        const amountMatch = Math.abs(Math.abs(tx.amount) - Math.abs(pm.amount)) < 0.005;
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
        usedPaymentIds.add(pm.id); // consumed — it cannot settle a second line
        
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
    // A wrong-tenant "Access denied" told a caller the record EXISTS in another tenant — an
    // existence oracle. Both fetch-by-id lookups now report "not found" for a foreign or a
    // missing record alike, so the two are indistinguishable.
    const tx = assertSameTenant(await this.txStore.get(transactionId), tenantId, 'bank transaction', transactionId);
    // State guard: a line already settled must be unreconciled first — re-pointing it silently
    // would strand the payment it used to carry. "already" → 409 via the error taxonomy.
    if (tx.status !== 'unreconciled') {
      throw new Error(`bank transaction ${transactionId} is already reconciled`);
    }
    const payment = assertSameTenant(await this.paymentStore.get(paymentId), tenantId, 'payment', paymentId);
    // One payment settles ONE line. autoMatch enforces this; a manual match must not be the
    // back door that lets a single payment clear two bank debits.
    const forAccount = await this.txStore.list({ tenantId, bankAccountId: tx.bankAccountId });
    if (forAccount.some((t) => t.id !== tx.id && t.reconciledPaymentId === payment.id)) {
      throw new Error(`payment ${paymentId} is already reconciled to another bank line`);
    }

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
    // Not-found parity — see reconcileManually above.
    const tx = assertSameTenant(await this.txStore.get(transactionId), tenantId, 'bank transaction', transactionId);

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
