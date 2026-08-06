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
    const access = { assert: vi.fn(), assertApprovalAuthority: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('INV-2026-0001') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());

    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, numbering, audit,
      { getRate: async () => 1 } as any, {} as any, {} as any, access,
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
    const access = { assert: vi.fn(), assertApprovalAuthority: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('INV-2026-0002') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());

    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, numbering, audit,
      { getRate: async () => 1 } as any, {} as any, {} as any, access,
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

// ── Regression (wave-3 audit): the settlement journal follows the payment date ───
describe('Payment GL journal is dated on the payment date, not entry time', () => {
  const wire = () => {
    const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn(), assertApprovalAuthority: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('INV-2026-0003') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, numbering, audit,
      { getRate: async () => 1 } as any, {} as any, {} as any, access,
    );
    invoices.onModuleInit();
    const accounts = new AccountService(new InMemoryAccountStore(), access);
    const periods = new InMemoryPeriodCloseStore();
    const journals = new JournalService(new InMemoryJournalStore(), events, periods, access);
    const payments = new PaymentService(new InMemoryPaymentStore(), events, bus, invoices, journals, accounts);
    payments.onModuleInit();
    return { invoices, accounts, periods, journals, payments };
  };

  it('posts the settlement journal on paidAt, so the sub-ledger and GL share a period', async () => {
    const { invoices, accounts, journals, payments } = wire();
    const invoice = await invoices.create({ tenantId: 't1', title: 'Backdated', value: 900, status: 'approved' });
    const bank = await accounts.create({ tenantId: 't1', code: '1010', name: 'Main Bank', type: 'asset' });

    await payments.record({ tenantId: 't1', invoiceId: invoice.id, bankAccountId: bank.id, amount: 900, paidAt: '2026-01-20T00:00:00.000Z' }, 'u1');

    const [journal] = await journals.list({ tenantId: 't1' });
    expect(journal.postedAt).toBe('2026-01-20T00:00:00.000Z');
  });

  it('rejects a payment back-dated into a closed period instead of silently posting it into the open one', async () => {
    const { invoices, accounts, periods, payments } = wire();
    const invoice = await invoices.create({ tenantId: 't1', title: 'Into a closed month', value: 400, status: 'approved' });
    const bank = await accounts.create({ tenantId: 't1', code: '1010', name: 'Main Bank', type: 'asset' });
    await periods.save({ id: 'pc1', tenantId: 't1', period: '2026-01', closedAt: '2026-02-01T00:00:00Z', closedBy: null, note: null });

    await expect(
      payments.record({ tenantId: 't1', invoiceId: invoice.id, bankAccountId: bank.id, amount: 400, paidAt: '2026-01-15T00:00:00.000Z' }, 'u1'),
    ).rejects.toThrow(/closed/);
  });
});
