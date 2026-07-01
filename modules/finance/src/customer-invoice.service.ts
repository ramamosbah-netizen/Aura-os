import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, type Currency, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, ExchangeRateService } from '@aura/core';
import {
  CUSTOMER_INVOICE_EVENT,
  type CustomerInvoice,
  type NewCustomerInvoice,
  makeCustomerInvoice,
  issueInvoice,
  recordReceipt,
  cancelInvoice,
} from './domain/customer-invoice';
import { type ArAgingReport, buildArAging } from './domain/ar-aging';
import { computeFxRevaluation } from './domain/fx-revaluation';
import { CUSTOMER_INVOICE_STORE, type CustomerInvoiceFilter, type CustomerInvoiceStore } from './customer-invoice-store';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import type { AccountType } from './domain/account';

/**
 * Customer (AR) invoice service — the receivable side. Owns
 * `aura_finance_customer_invoices` and emits `finance.customer_invoice.*` on the spine.
 */
@Injectable()
export class CustomerInvoiceService {
  private readonly logger = new Logger('CustomerInvoice');

  constructor(
    @Inject(CUSTOMER_INVOICE_STORE) private readonly store: CustomerInvoiceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly fx: ExchangeRateService,
    private readonly journals: JournalService,
    private readonly accounts: AccountService,
  ) {}

  private async ensureAccount(tenantId: string, code: string, name: string, type: AccountType) {
    const existing = await this.accounts.getByCode(tenantId, code);
    return existing ?? this.accounts.create({ tenantId, code, name, type });
  }

  /** Compute the AR FX revaluation and post the unrealized gain/loss journal to the GL. */
  async postFxRevaluation(tenantId: string, asOf?: string, actorId?: Id): Promise<{ revaluation: Awaited<ReturnType<CustomerInvoiceService['fxRevaluation']>>; journalId: string | null }> {
    const reval = await this.fxRevaluation(tenantId, asOf);
    const gl = Math.round(reval.totalGainLoss * 100) / 100;
    if (gl === 0) return { revaluation: reval, journalId: null };

    const arControl = await this.ensureAccount(tenantId, '1200', 'Accounts Receivable', 'asset');
    const gainAcc = await this.ensureAccount(tenantId, '4900', 'FX Gain (unrealized)', 'revenue');
    const lossAcc = await this.ensureAccount(tenantId, '5900', 'FX Loss (unrealized)', 'expense');
    const amount = Math.abs(gl);
    // gain: Dr AR / Cr FX gain · loss: Dr FX loss / Cr AR
    const lines = gl > 0
      ? [{ accountId: arControl.id, accountCode: arControl.code, accountName: arControl.name, debit: amount, credit: 0 },
         { accountId: gainAcc.id, accountCode: gainAcc.code, accountName: gainAcc.name, debit: 0, credit: amount }]
      : [{ accountId: lossAcc.id, accountCode: lossAcc.code, accountName: lossAcc.name, debit: amount, credit: 0 },
         { accountId: arControl.id, accountCode: arControl.code, accountName: arControl.name, debit: 0, credit: amount }];
    const journal = await this.journals.post({ tenantId, description: `Unrealized FX revaluation (AR) as of ${reval.asOf}`, reference: `FXREVAL-${reval.asOf}`, lines }, actorId);
    this.logger.log(`Posted AR FX revaluation ${reval.asOf}: ${gl > 0 ? 'gain' : 'loss'} ${amount} (journal ${journal.id})`);
    return { revaluation: reval, journalId: journal.id };
  }

  async create(input: NewCustomerInvoice): Promise<CustomerInvoice> {
    // Multi-currency: for a non-base (≠AED) invoice with no explicit rate, resolve the
    // effective rate to the base currency so baseTotal is computed for consolidated reporting.
    const currency = (input.currency ?? 'AED').toUpperCase();
    if (currency !== 'AED' && input.exchangeRate === undefined) {
      const rate = await this.fx.getRate(input.tenantId, currency as Currency, 'AED');
      input = { ...input, exchangeRate: rate };
    }
    const inv = makeCustomerInvoice(input);
    await this.store.save(inv);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_INVOICE_EVENT.created,
        tenantId: inv.tenantId,
        companyId: inv.companyId,
        actorId: inv.createdBy,
        aggregateType: 'finance.customer_invoice',
        aggregateId: inv.id,
        payload: { invoiceNumber: inv.invoiceNumber, customerName: inv.customerName, total: inv.total },
      }),
    ]);
    this.logger.log(`Customer invoice ${inv.invoiceNumber} created for ${inv.customerName}: total ${inv.total}`);
    return inv;
  }

  async issue(id: Id): Promise<CustomerInvoice> {
    const inv = await this.store.get(id);
    if (!inv) throw new Error(`customer invoice ${id} not found`);
    const updated = issueInvoice(inv);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_INVOICE_EVENT.issued,
        tenantId: inv.tenantId, companyId: inv.companyId, actorId: null,
        aggregateType: 'finance.customer_invoice', aggregateId: id,
        payload: { invoiceNumber: inv.invoiceNumber, total: inv.total },
      }),
    ]);
    return updated;
  }

  async recordReceipt(id: Id, amount: number): Promise<CustomerInvoice> {
    const inv = await this.store.get(id);
    if (!inv) throw new Error(`customer invoice ${id} not found`);
    const updated = recordReceipt(inv, amount);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_INVOICE_EVENT.receiptRecorded,
        tenantId: inv.tenantId, companyId: inv.companyId, actorId: null,
        aggregateType: 'finance.customer_invoice', aggregateId: id,
        payload: { amount: Number(amount), amountPaid: updated.amountPaid, status: updated.status },
      }),
    ]);
    this.logger.log(`Receipt ${amount} on invoice ${inv.invoiceNumber} → paid ${updated.amountPaid}/${inv.total} (${updated.status})`);
    return updated;
  }

  async cancel(id: Id): Promise<CustomerInvoice> {
    const inv = await this.store.get(id);
    if (!inv) throw new Error(`customer invoice ${id} not found`);
    const updated = cancelInvoice(inv);
    await this.store.save(updated);
    return updated;
  }

  get(id: Id): Promise<CustomerInvoice | null> {
    return this.store.get(id);
  }

  list(filter?: CustomerInvoiceFilter): Promise<CustomerInvoice[]> {
    return this.store.list(filter);
  }

  listPaged(filter: CustomerInvoiceFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** FX revaluation — unrealized gain/loss on open foreign-currency AR at current rates. */
  async fxRevaluation(tenantId: string, asOf?: string, baseCurrency = 'AED') {
    const all = await this.store.list({ tenantId, limit: 1000 });
    const rateCache = new Map<string, number>();
    for (const inv of all) {
      const c = (inv.currency ?? baseCurrency).toUpperCase();
      if (c !== baseCurrency && !rateCache.has(c)) {
        rateCache.set(c, await this.fx.getRate(tenantId, c as Currency, baseCurrency as Currency));
      }
    }
    return computeFxRevaluation(
      all.map((i) => ({ invoiceNumber: i.invoiceNumber, currency: i.currency ?? baseCurrency, exchangeRate: i.exchangeRate ?? 1, total: i.total, amountPaid: i.amountPaid, status: i.status })),
      (c) => rateCache.get(c) ?? 1,
      asOf ?? new Date().toISOString().slice(0, 10),
      baseCurrency,
    );
  }

  /** AR aging — outstanding receivables bucketed by overdue age, as of `asOf` (default today). */
  async aging(tenantId: string, asOf?: string): Promise<ArAgingReport> {
    const all = await this.store.list({ tenantId, limit: 1000 });
    return buildArAging(all, asOf ?? new Date().toISOString().slice(0, 10));
  }
}
