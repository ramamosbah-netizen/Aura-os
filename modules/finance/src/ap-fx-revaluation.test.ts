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
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { InMemoryAccountStore } from './in-memory-account-store';

/**
 * AP multi-currency + FX revaluation: a EUR supplier invoice is booked at the rate at
 * creation; when the period-end rate rises we owe MORE in base terms — an unrealized LOSS
 * that must post Dr FX-loss / Cr AP-control (AP is a credit-normal liability).
 */
describe('AP FX revaluation', () => {
  function build(rates: { create: number; reval: number }) {
    const events = {
      append: vi.fn().mockResolvedValue(undefined),
      appendWithClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('AP-2026-0001') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
    const mockPO = { get: async () => null } as unknown as PurchaseOrderService;
    const mockGRN = { list: async () => [] } as unknown as GoodsReceiptService;

    // First getRate call (create) returns the booked rate; later calls (reval) the period-end rate.
    let calls = 0;
    const fx = { getRate: async () => (calls++ === 0 ? rates.create : rates.reval) } as any;

    const accounts = new AccountService(new InMemoryAccountStore(), access);
    const journals = new JournalService(new InMemoryJournalStore(), events, new InMemoryPeriodCloseStore(), access);
    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, mockPO, mockGRN, numbering, audit,
      fx, journals, accounts,
    );
    invoices.onModuleInit();
    return { invoices, journals };
  }

  it('books baseValue at the creation rate and posts an unrealized LOSS when the rate rises', async () => {
    const { invoices, journals } = build({ create: 4.0, reval: 4.2 });
    const inv = await invoices.create({ tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved' });
    expect(inv.currency).toBe('EUR');
    expect(inv.exchangeRate).toBe(4.0);
    expect(inv.baseValue).toBe(4000);

    const reval = await invoices.fxRevaluation('t1');
    // 1000 EUR × (4.2 − 4.0) = +200 delta (base@current − base@booked)
    expect(reval.totalGainLoss).toBe(200);

    const { journalId } = await invoices.postFxRevaluation('t1');
    expect(journalId).not.toBeNull();
    const j = await journals.get(journalId!);
    const loss = j!.lines.find((l) => l.accountCode === '5900');
    const ap = j!.lines.find((l) => l.accountCode === '2010');
    // owe more → Dr FX loss 200 / Cr AP 200
    expect(loss?.debit).toBe(200);
    expect(ap?.credit).toBe(200);
  });

  it('posts an unrealized GAIN when the rate falls', async () => {
    const { invoices, journals } = build({ create: 4.0, reval: 3.8 });
    await invoices.create({ tenantId: 't1', title: 'EUR cable', value: 1000, currency: 'EUR', status: 'approved' });
    const { journalId } = await invoices.postFxRevaluation('t1');
    const j = await journals.get(journalId!);
    const gain = j!.lines.find((l) => l.accountCode === '4900');
    const ap = j!.lines.find((l) => l.accountCode === '2010');
    // owe less → Dr AP 200 / Cr FX gain 200
    expect(gain?.credit).toBe(200);
    expect(ap?.debit).toBe(200);
  });

  it('ignores base-currency (AED) invoices — no journal', async () => {
    const { invoices } = build({ create: 1, reval: 1 });
    await invoices.create({ tenantId: 't1', title: 'AED local', value: 5000, status: 'approved' });
    const { journalId } = await invoices.postFxRevaluation('t1');
    expect(journalId).toBeNull();
  });
});
