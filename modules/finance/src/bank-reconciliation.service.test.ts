import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { BankReconciliationService } from './bank-reconciliation.service';
import { InMemoryBankTransactionStore } from './in-memory-bank-transaction-store';
import { InMemoryPaymentStore } from './in-memory-payment-store';
import { makePayment } from './domain/payment';

// BankReconciliationService had no test. Reconciliation exists to surface the difference between
// what the bank did and what the books say — so the cases that matter are the ones where those
// two disagree.

const events = () => ({ append: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const DAY = '2026-03-01';
const T = 't-rec';
const BANK = 'bank-1';

async function harness() {
  const txStore = new InMemoryBankTransactionStore();
  const payStore = new InMemoryPaymentStore();
  const svc = new BankReconciliationService(txStore, payStore, events());
  const pay = async (amount: number, paidAt = `${DAY}T10:00:00.000Z`) => {
    const p = makePayment({ tenantId: T, invoiceId: 'inv', bankAccountId: BANK, amount, paidAt });
    await payStore.create(p);
    return p;
  };
  const statement = (lines: Array<{ amount: number; description: string; transactionDate?: string }>) =>
    svc.importStatement(
      T,
      BANK,
      lines.map((l) => ({ transactionDate: l.transactionDate ?? DAY, amount: l.amount, description: l.description })),
    );
  return { svc, pay, statement };
}

describe('BankReconciliationService — a payment settles one bank line only', () => {
  it('leaves a duplicate bank debit unreconciled instead of matching it to the same payment', async () => {
    // The account is 50,000 lighter than the books. That gap is the whole point of reconciling,
    // and it used to be erased: both lines matched the one payment and nothing was left flagged.
    const { svc, pay, statement } = await harness();
    await pay(50_000);
    await statement([
      { amount: 50_000, description: 'Supplier ACME' },
      { amount: 50_000, description: 'Supplier ACME — duplicate' },
    ]);

    const matches = await svc.autoMatch(T, BANK);
    expect(matches).toHaveLength(1);

    const open = (await svc.listTransactions(T, BANK, 'unreconciled'));
    expect(open).toHaveLength(1); // the duplicate stays visible
  });

  it('does not reuse a payment that an earlier run already matched', async () => {
    const { svc, pay, statement } = await harness();
    await pay(50_000);
    await statement([{ amount: 50_000, description: 'Supplier ACME' }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(1);

    // A second statement import brings the same debit again.
    await statement([{ amount: 50_000, description: 'Supplier ACME — duplicate' }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(0);
    expect(await svc.listTransactions(T, BANK, 'unreconciled')).toHaveLength(1);
  });

  it('matches two real debits to their own two payments', async () => {
    // Distinct amounts, so each line has exactly one candidate. (Two IDENTICAL payments against
    // two identical debits is genuinely ambiguous and the routine refuses both — see the last
    // test in this file. That conservatism is correct: a human decides which settles which.)
    const { svc, pay, statement } = await harness();
    await pay(50_000);
    await pay(31_500);
    await statement([
      { amount: 50_000, description: 'Supplier ACME' },
      { amount: 31_500, description: 'Supplier Gulf Cables' },
    ]);
    const matches = await svc.autoMatch(T, BANK);
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((m) => m.paymentId)).size).toBe(2); // two distinct payments
  });
});

describe('BankReconciliationService — matching rules', () => {
  it('reconciles a payment recorded days after the money moved', async () => {
    // makePayment used to stamp paidAt as "now" with no way to set it, so a statement reconciled
    // even a fortnight late could never match: every payment carried today's date.
    const { svc, pay, statement } = await harness();
    await pay(12_000, `${DAY}T09:00:00.000Z`);
    await statement([{ amount: 12_000, description: 'Etisalat', transactionDate: DAY }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(1);
  });

  it('tolerates sub-fils drift rather than demanding exact float equality', async () => {
    const { svc, pay, statement } = await harness();
    await pay(50_000);
    await statement([{ amount: 49_999.999_999, description: 'Supplier ACME' }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(1);
  });

  it('leaves a line with no matching payment alone', async () => {
    const { svc, statement } = await harness();
    await statement([{ amount: 8_400, description: 'Unknown debit' }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(0);
    expect(await svc.listTransactions(T, BANK, 'unreconciled')).toHaveLength(1);
  });

  it('refuses to guess when two payments could both explain one line', async () => {
    const { svc, pay, statement } = await harness();
    await pay(20_000);
    await pay(20_000);
    await statement([{ amount: 20_000, description: 'Ambiguous' }]);
    expect(await svc.autoMatch(T, BANK)).toHaveLength(0); // a human decides
  });
});
