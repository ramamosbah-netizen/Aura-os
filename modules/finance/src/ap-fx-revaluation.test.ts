import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  ExchangeRateService,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
  type NumberingService,
  type AuditService,
} from '@aura/core';
import { InvoiceService } from './invoice.service';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import { InMemoryInvoiceStore } from './in-memory-invoice-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { InMemoryPeriodCloseStore } from './in-memory-period-close-store';
import { InMemoryAccountStore } from './in-memory-account-store';

/**
 * AP multi-currency + FX revaluation.
 *
 * A EUR supplier invoice is booked at the rate GOVERNED ON ITS OWN DATE; when the period-end rate
 * rises we owe MORE in base terms — an unrealized LOSS that posts Dr FX-loss / Cr AP-control (AP is
 * a credit-normal liability).
 *
 * The FX authority here is the REAL service with rates registered on real dates, not a stub that
 * answers a different number each call. FX-01 is the reason: a stub which cannot refuse, and which
 * cannot tell one date from another, is incapable of exercising the two properties that matter —
 * that booking uses the invoice's own date, and that revaluation uses the revaluation's.
 */
describe('AP FX revaluation', () => {
  function build(): { invoices: InvoiceService; journals: JournalService; fx: ExchangeRateService } {
    const events = {
      append: vi.fn().mockResolvedValue(undefined),
      appendWithClient: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventStore;
    const access = { assert: vi.fn(), assertApprovalAuthority: vi.fn() } as unknown as AccessService;
    const numbering = { generateNextNumber: vi.fn().mockResolvedValue('AP-2026-0001') } as unknown as NumberingService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
    const fx = new ExchangeRateService(null);

    const accounts = new AccountService(new InMemoryAccountStore(), access);
    const journals = new JournalService(new InMemoryJournalStore(), events, new InMemoryPeriodCloseStore(), access);
    const invoices = new InvoiceService(
      new InMemoryInvoiceStore(), events, new NullTxRunner(), bus, numbering, audit,
      fx, journals, accounts, access,
    );
    invoices.onModuleInit();
    return { invoices, journals, fx };
  }

  it('books baseValue at the rate governing its OWN date and posts an unrealized LOSS when the rate rises', async () => {
    const { invoices, journals, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.0, new Date('2026-06-01'));
    await fx.setRate('t1', 'EUR', 'AED', 4.2, new Date('2026-06-30'));

    const inv = await invoices.create({
      tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    });
    expect(inv.currency).toBe('EUR');
    expect(inv.exchangeRate).toBe(4.0);
    expect(inv.baseValue).toBe(4000);
    // …and it records WHICH rate did that, not merely the number.
    expect(inv.exchangeRateEffectiveDate).toBe('2026-06-01');
    expect(inv.exchangeRateSource).toBe('registered');

    const reval = await invoices.fxRevaluation('t1', '2026-06-30');
    expect(reval.complete).toBe(true);
    // 1000 EUR × (4.2 − 4.0) = +200 delta (base@current − base@booked)
    expect(reval.totalGainLoss).toBe(200);

    const { journalId } = await invoices.postFxRevaluation('t1', '2026-06-30');
    expect(journalId).not.toBeNull();
    const j = await journals.get(journalId!);
    const loss = j!.lines.find((l) => l.accountCode === '5900');
    const ap = j!.lines.find((l) => l.accountCode === '2010');
    // owe more → Dr FX loss 200 / Cr AP 200
    expect(loss?.debit).toBe(200);
    expect(ap?.credit).toBe(200);
  });

  it('posts an unrealized GAIN when the rate falls', async () => {
    const { invoices, journals, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.0, new Date('2026-06-01'));
    await fx.setRate('t1', 'EUR', 'AED', 3.8, new Date('2026-06-30'));

    await invoices.create({
      tenantId: 't1', title: 'EUR cable', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    });
    const { journalId } = await invoices.postFxRevaluation('t1', '2026-06-30');
    const j = await journals.get(journalId!);
    const gain = j!.lines.find((l) => l.accountCode === '4900');
    const ap = j!.lines.find((l) => l.accountCode === '2010');
    // owe less → Dr AP 200 / Cr FX gain 200
    expect(gain?.credit).toBe(200);
    expect(ap?.debit).toBe(200);
  });

  it('ignores base-currency (AED) invoices — no journal, and no governed rate needed', async () => {
    const { invoices } = build();
    await invoices.create({ tenantId: 't1', title: 'AED local', value: 5000, status: 'approved' });
    const { journalId } = await invoices.postFxRevaluation('t1');
    expect(journalId).toBeNull();
  });

  it('uses the rate governing the REVALUATION date, not the latest rate on file', async () => {
    const { invoices, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.0, new Date('2026-06-01'));
    await fx.setRate('t1', 'EUR', 'AED', 4.2, new Date('2026-06-30'));
    await fx.setRate('t1', 'EUR', 'AED', 9.9, new Date('2026-07-31'));

    await invoices.create({
      tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    });

    // A June close must not be moved by a July rate. 1000 × (4.2 − 4.0) = 200, not (9.9 − 4.0).
    const june = await invoices.fxRevaluation('t1', '2026-06-30');
    expect(june.totalGainLoss).toBe(200);
  });

  it('REFUSES to book at all when no rate governs the invoice date', async () => {
    const { invoices, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.2, new Date('2026-06-30'));

    // The invoice is dated BEFORE the only rate on file, so nothing governs it.
    await expect(invoices.create({
      tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    })).rejects.toThrow(/No governed EUR\/AED exchange rate is available for 10 Jun 2026/);
  });

  it('reports an unmeasurable exposure as UNRESOLVED, and refuses to post it as a flat position', async () => {
    const { invoices, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.0, new Date('2026-06-01'));
    await invoices.create({
      tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    });

    // No rate governs the period end. The old behaviour fell back to the booked rate, reported a
    // gain/loss of zero and posted nothing — a flat position indistinguishable from a measured one.
    const reval = await invoices.fxRevaluation('t1', '2026-05-01');
    expect(reval.complete).toBe(false);
    expect(reval.lines).toHaveLength(0);
    expect(reval.unresolved).toHaveLength(1);
    expect(reval.unresolved[0]).toMatchObject({ currency: 'EUR', reason: 'no_governed_rate', outstanding: 1000 });

    await expect(invoices.postFxRevaluation('t1', '2026-05-01'))
      .rejects.toThrow(/incomplete and cannot be posted/);
  });

  it('does not re-resolve the booked rate — the invoice keeps the rate it was booked at', async () => {
    const { invoices, fx } = build();
    await fx.setRate('t1', 'EUR', 'AED', 4.0, new Date('2026-06-01'));
    const inv = await invoices.create({
      tenantId: 't1', title: 'EUR steel', value: 1000, currency: 'EUR', status: 'approved',
      invoiceDate: '2026-06-10',
    });

    // The register is CORRECTED after the fact — June's rate is restated to 5.0.
    await fx.setRate('t1', 'EUR', 'AED', 5.0, new Date('2026-06-01'));
    await fx.setRate('t1', 'EUR', 'AED', 4.2, new Date('2026-06-30'));

    const reval = await invoices.fxRevaluation('t1', '2026-06-30');
    // The movement is measured from what the document ACTUALLY carries (4.0), not from a fresh
    // opinion about what June's rate was (5.0) — which would have made this −800 instead of +200.
    expect(reval.lines[0].bookedRate).toBe(4.0);
    expect(reval.totalGainLoss).toBe(200);
    expect(inv.exchangeRate).toBe(4.0);
  });
});
