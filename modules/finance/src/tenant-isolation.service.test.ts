import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  TenantContext,
  type EventStore,
  type AccessService,
  type NumberingService,
  type AuditService,
} from '@aura/core';
import { InvoiceService } from './invoice.service';
import { CustomerInvoiceService } from './customer-invoice.service';
import { PaymentService } from './payment.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { InMemoryCustomerInvoiceStore } from './in-memory-customer-invoice-store';
import { InMemoryPaymentStore } from './in-memory-payment-store';
import { InMemoryBankTransactionStore } from './in-memory-bank-transaction-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { InMemoryAccountStore } from './in-memory-account-store';
import { makeInvoice } from './domain/invoice';
import { makeCustomerInvoice } from './domain/customer-invoice';
import { makeBankTransaction } from './domain/bank-transaction';
import { makePayment } from './domain/payment';

/**
 * Cross-tenant isolation at the SERVICE layer (register G-03).
 *
 * Every finance store fetches a record by id alone (`WHERE id = $1`), and RLS is inert in the
 * running deployment because the app connects as the database owner. So the ONLY tenant boundary
 * on a fetch-by-id-then-mutate is the one the service enforces. These tests act as a second tenant
 * against the first tenant's records and prove:
 *   1. the mutation is refused,
 *   2. the refusal is "not found" — never "exists in another tenant",
 *   3. the target record is left unchanged,
 *   4. the legitimate owner is still allowed (no over-blocking).
 */

const A = 'tenant-a';
const B = 'tenant-b';
const asB = <T>(tenant: TenantContext, fn: () => Promise<T>) =>
  tenant.run({ tenantId: B, companyId: null, actorId: null }, fn);
const asA = <T>(tenant: TenantContext, fn: () => Promise<T>) =>
  tenant.run({ tenantId: A, companyId: null, actorId: null }, fn);

const events = () =>
  ({ append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const access = () => ({ assert: vi.fn(), assertApprovalAuthority: vi.fn() }) as unknown as AccessService;
const numbering = () => ({ generateNextNumber: vi.fn().mockResolvedValue('INV-1') }) as unknown as NumberingService;
const audit = () => ({ log: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditService;

// ── InvoiceService ────────────────────────────────────────────────────────────
function invoiceHarness() {
  const store = new InMemoryInvoiceStore();
  const ac = access();
  const tenant = new TenantContext();
  const bus = new CommandBus(ac, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const svc = new InvoiceService(
    store, events(), new NullTxRunner(), bus, numbering(), audit(),
    { getRate: async () => 1 } as any, {} as any, {} as any, ac,
    undefined, tenant,
  );
  return { store, svc, tenant };
}

describe('InvoiceService — tenant isolation', () => {
  it('a second tenant cannot update another tenant\'s invoice, and it stays unchanged', async () => {
    const { store, svc, tenant } = invoiceHarness();
    const inv = makeInvoice({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    await store.create(inv);

    await asB(tenant, () => expect(svc.update(inv.id, { title: 'hijacked' })).rejects.toThrow(/not found/i));
    expect((await store.get(inv.id))?.title).toBe('A rent'); // untouched
  });

  it('a second tenant cannot change status (e.g. approve/pay) another tenant\'s invoice', async () => {
    const { store, svc, tenant } = invoiceHarness();
    const inv = makeInvoice({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    await store.create(inv);

    await asB(tenant, () => expect(svc.changeStatus(inv.id, 'paid')).rejects.toThrow(/not found/i));
    expect((await store.get(inv.id))?.status).toBe('approved'); // still approved, not paid
  });

  it('the getter returns null across tenants but the record to its owner', async () => {
    const { store, svc, tenant } = invoiceHarness();
    const inv = makeInvoice({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    await store.create(inv);

    expect(await asB(tenant, () => svc.get(inv.id))).toBeNull();
    expect((await asA(tenant, () => svc.get(inv.id)))?.id).toBe(inv.id);
  });

  it('the owner is still allowed to update (no over-blocking)', async () => {
    const { store, svc, tenant } = invoiceHarness();
    const inv = makeInvoice({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    await store.create(inv);

    const updated = await asA(tenant, () => svc.update(inv.id, { title: 'A rent v2' }));
    expect(updated.title).toBe('A rent v2');
    expect((await store.get(inv.id))?.title).toBe('A rent v2');
  });
});

// ── CustomerInvoiceService ──────────────────────────────────────────────────────
function customerInvoiceHarness() {
  const store = new InMemoryCustomerInvoiceStore();
  const tenant = new TenantContext();
  const svc = new CustomerInvoiceService(
    store, events(), { getRate: async () => 1 } as any, {} as any, {} as any, undefined, tenant,
  );
  const seed = () =>
    makeCustomerInvoice({
      tenantId: A, invoiceNumber: 'CINV-1', customerName: 'Acme', issueDate: '2026-01-10',
      lines: [{ description: 'work', quantity: 1, unitPrice: 1000 }],
    });
  return { store, svc, tenant, seed };
}

describe('CustomerInvoiceService — tenant isolation', () => {
  it('a second tenant cannot issue another tenant\'s AR invoice', async () => {
    const { store, svc, tenant, seed } = customerInvoiceHarness();
    const ci = seed();
    await store.save(ci);
    await asB(tenant, () => expect(svc.issue(ci.id)).rejects.toThrow(/not found/i));
    expect((await store.get(ci.id))?.status).toBe(ci.status); // unchanged
  });

  it('a second tenant cannot record a receipt against another tenant\'s AR invoice', async () => {
    const { store, svc, tenant, seed } = customerInvoiceHarness();
    const ci = seed();
    await store.save(ci);
    await asB(tenant, () => expect(svc.recordReceipt(ci.id, 500)).rejects.toThrow(/not found/i));
    expect((await store.get(ci.id))?.amountPaid).toBe(0); // no phantom receipt
  });

  it('a second tenant cannot cancel another tenant\'s AR invoice; the owner can', async () => {
    const { store, svc, tenant, seed } = customerInvoiceHarness();
    const ci = seed();
    await store.save(ci);
    await asB(tenant, () => expect(svc.cancel(ci.id)).rejects.toThrow(/not found/i));
    expect((await store.get(ci.id))?.status).not.toBe('cancelled');

    const cancelled = await asA(tenant, () => svc.cancel(ci.id));
    expect(cancelled.status).toBe('cancelled');
  });

  it('the getter returns null across tenants', async () => {
    const { store, svc, tenant, seed } = customerInvoiceHarness();
    const ci = seed();
    await store.save(ci);
    expect(await asB(tenant, () => svc.get(ci.id))).toBeNull();
    expect((await asA(tenant, () => svc.get(ci.id)))?.id).toBe(ci.id);
  });
});

// ── PaymentService ──────────────────────────────────────────────────────────────
function paymentHarness() {
  const ev = events();
  const ac = access();
  const bus = new CommandBus(ac, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const invStore = new InMemoryInvoiceStore();
  const invoices = new InvoiceService(
    invStore, ev, new NullTxRunner(), bus, numbering(), audit(),
    { getRate: async () => 1 } as any, {} as any, {} as any, ac,
  );
  invoices.onModuleInit();
  const accounts = new AccountService(new InMemoryAccountStore(), ac);
  const journals = new JournalService(new InMemoryJournalStore(), ev, new InMemoryPeriodCloseStore(), ac);
  const payStore = new InMemoryPaymentStore();
  const payments = new PaymentService(payStore, ev, bus, invoices, journals, accounts);
  payments.onModuleInit();
  return { invoices, invStore, accounts, payments, payStore };
}

describe('PaymentService — tenant isolation', () => {
  it('recording a payment against another tenant\'s invoice is refused and does NOT mark it paid', async () => {
    const { invoices, invStore, accounts, payments, payStore } = paymentHarness();
    const inv = await invoices.create({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    const bankB = await accounts.create({ tenantId: B, code: '1010', name: 'B Bank', type: 'asset' });

    await expect(
      payments.record({ tenantId: B, invoiceId: inv.id, bankAccountId: bankB.id, amount: 1000 }, 'u-b'),
    ).rejects.toThrow(/not found/i);

    expect((await invStore.get(inv.id))?.status).toBe('approved'); // NOT flipped to paid
    expect((await payStore.list({ tenantId: B })).length).toBe(0); // no cross-tenant payment row
  });

  it('the owner can pay its own invoice (no over-blocking)', async () => {
    const { invoices, invStore, accounts, payments } = paymentHarness();
    const inv = await invoices.create({ tenantId: A, title: 'A rent', value: 1000, status: 'approved' });
    const bankA = await accounts.create({ tenantId: A, code: '1010', name: 'A Bank', type: 'asset' });

    await payments.record({ tenantId: A, invoiceId: inv.id, bankAccountId: bankA.id, amount: 1000 }, 'u-a');
    expect((await invStore.get(inv.id))?.status).toBe('paid');
  });
});

// ── BankReconciliationService ─────────────────────────────────────────────────────
function bankReconHarness() {
  const txStore = new InMemoryBankTransactionStore();
  const payStore = new InMemoryPaymentStore();
  const svc = new BankReconciliationService(txStore, payStore, events());
  return { txStore, payStore, svc };
}

describe('BankReconciliationService — tenant isolation', () => {
  it('a second tenant cannot reconcile/unreconcile another tenant\'s bank line, which stays unreconciled', async () => {
    const { txStore, svc } = bankReconHarness();
    const tx = makeBankTransaction({ tenantId: A, bankAccountId: 'ba-1', transactionDate: '2026-01-10', amount: 1000, description: 'x' });
    await txStore.create(tx);

    await expect(svc.reconcileManually(B, tx.id, 'p-any')).rejects.toThrow(/not found/i);
    await expect(svc.unreconcile(B, tx.id)).rejects.toThrow(/not found/i);
    expect((await txStore.get(tx.id))?.status).toBe('unreconciled');
  });

  it('closes the existence oracle: wrong-tenant and truly-missing are indistinguishable', async () => {
    const { txStore, svc } = bankReconHarness();
    const tx = makeBankTransaction({ tenantId: A, bankAccountId: 'ba-1', transactionDate: '2026-01-10', amount: 1000, description: 'x' });
    await txStore.create(tx);

    const wrongTenant = await svc.reconcileManually(B, tx.id, 'p').catch((e) => (e as Error).message);
    const trulyMissing = await svc.reconcileManually(B, 'no-such-tx', 'p').catch((e) => (e as Error).message);
    // Both say "… not found" and neither says "Access denied" — a caller cannot tell the two apart.
    expect(wrongTenant).toMatch(/not found/i);
    expect(trulyMissing).toMatch(/not found/i);
    expect(wrongTenant).not.toMatch(/access denied/i);
  });

  it('the owner can reconcile its own bank line (no over-blocking)', async () => {
    const { txStore, payStore, svc } = bankReconHarness();
    const tx = makeBankTransaction({ tenantId: A, bankAccountId: 'ba-1', transactionDate: '2026-01-10', amount: 1000, description: 'x' });
    await txStore.create(tx);
    const pay = makePayment({ tenantId: A, invoiceId: 'inv-x', bankAccountId: 'ba-1', amount: 1000 });
    await payStore.create(pay);

    const res = await svc.reconcileManually(A, tx.id, pay.id);
    expect(res.status).toBe('manual');
    expect(res.reconciledPaymentId).toBe(pay.id);
  });
});
