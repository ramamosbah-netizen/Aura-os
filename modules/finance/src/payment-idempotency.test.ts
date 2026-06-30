import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
  type NumberingService,
  type AuditService,
} from '@aura/core';
import type { PurchaseOrderService } from '@aura/procurement';
import type { GoodsReceiptService } from '@aura/inventory';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { InMemoryPaymentStore } from './in-memory-payment-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { InMemoryAccountStore } from './in-memory-account-store';

/**
 * The classic double-payment bug: a client retries a payment it never got a response for,
 * the server had actually succeeded, and a SECOND payment + SECOND ledger journal post.
 * Recording now runs through the real CommandBus, so the same Idempotency-Key replays the
 * cached result without re-executing.
 */
describe('Payment recording idempotency', () => {
  it('replaying the same key returns the same payment and posts exactly one journal', async () => {
    const events = {
      append: vi.fn().mockResolvedValue(undefined),
      appendWithClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('INV-2026-0001') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());

    const mockPO = { get: async () => null } as unknown as PurchaseOrderService;
    const mockGRN = { list: async () => [] } as unknown as GoodsReceiptService;

    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, mockPO, mockGRN, numbering, audit,
    );
    invoices.onModuleInit();
    const accounts = new AccountService(new InMemoryAccountStore(), access);
    const journals = new JournalService(new InMemoryJournalStore(), events, new InMemoryPeriodCloseStore(), access);
    const payments = new PaymentService(new InMemoryPaymentStore(), events, bus, invoices, journals, accounts);
    payments.onModuleInit();

    const invoice = await invoices.create({ tenantId: 't1', title: 'Office Rent', value: 1200, status: 'approved' });
    const bank = await accounts.create({ tenantId: 't1', code: '1010', name: 'Main Bank', type: 'asset' });

    const pay = { tenantId: 't1', invoiceId: invoice.id, bankAccountId: bank.id, amount: 1200, reference: 'TX-1' };
    const first = await payments.record(pay, 'u1', 'pay-key-1');
    const replay = await payments.record(pay, 'u1', 'pay-key-1'); // retry, same key

    expect(replay.id).toBe(first.id); // cached replay — handler not re-run
    expect((await payments.list({ tenantId: 't1' })).length).toBe(1); // exactly one payment
    expect((await journals.list({ tenantId: 't1' })).length).toBe(1); // exactly one journal — no double-post
  });

  it('a different key records a distinct payment (no over-caching)', async () => {
    const events = {
      append: vi.fn().mockResolvedValue(undefined),
      appendWithClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('INV-2026-0002') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
    const mockPO = { get: async () => null } as unknown as PurchaseOrderService;
    const mockGRN = { list: async () => [] } as unknown as GoodsReceiptService;

    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, mockPO, mockGRN, numbering, audit,
    );
    invoices.onModuleInit();
    const accounts = new AccountService(new InMemoryAccountStore(), access);
    const journals = new JournalService(new InMemoryJournalStore(), events, new InMemoryPeriodCloseStore(), access);
    const payments = new PaymentService(new InMemoryPaymentStore(), events, bus, invoices, journals, accounts);
    payments.onModuleInit();

    const inv1 = await invoices.create({ tenantId: 't1', title: 'Inv A', value: 500, status: 'approved' });
    const inv2 = await invoices.create({ tenantId: 't1', title: 'Inv B', value: 700, status: 'approved' });
    const bank = await accounts.create({ tenantId: 't1', code: '1010', name: 'Main Bank', type: 'asset' });

    await payments.record({ tenantId: 't1', invoiceId: inv1.id, bankAccountId: bank.id, amount: 500 }, 'u1', 'k-a');
    await payments.record({ tenantId: 't1', invoiceId: inv2.id, bankAccountId: bank.id, amount: 700 }, 'u1', 'k-b');

    expect((await payments.list({ tenantId: 't1' })).length).toBe(2);
  });
});
