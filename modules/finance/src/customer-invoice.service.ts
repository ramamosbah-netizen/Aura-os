import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, type PageParams, type Currency, makeEvent, moneyNumber } from '@aura/shared';
import { EVENT_STORE, type EventStore, ExchangeRateService, TenantContext } from '@aura/core';
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
import { evaluateContractCap } from './domain/contract-cap';
import { CONTRACT_CAP_PORT, type ContractCapPort } from './contract-cap.port';
import { CUSTOMER_INVOICE_STORE, type CustomerInvoiceFilter, type CustomerInvoiceStore } from './customer-invoice-store';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';
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
    // Cross-context contract data for the AR billing cap — bound by the app layer (ADR-0004).
    // Optional so the module stays self-contained; unbound → the cap is skipped, mirroring the
    // AP 3-way match's PO_MATCH_PORT.
    @Optional() @Inject(CONTRACT_CAP_PORT) private readonly contractCap?: ContractCapPort,
    // Explicit @Inject: a union-typed ctor param emits `Object` and silently injects null.
    // Optional so in-memory tests need no request context.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  /**
   * The AR billing cap (G-08): total billed against a contract may exceed neither the approved
   * contract value nor the net certified to date. The AP side has had a 3-way match from the
   * start; this is its receivable mirror. IPC-driven invoices pass by construction (the
   * certificate that generated them is what raises the certified figure); the bound exists for
   * invoices raised by hand.
   */
  private async assertWithinContractCap(input: NewCustomerInvoice, newInvoiceNet: number): Promise<void> {
    const contractId = input.contractRef?.trim();
    if (!contractId || !this.contractCap) return; // no contract, or no data source bound → skip

    const snapshot = await this.contractCap.getSnapshot(input.tenantId, contractId);
    if (!snapshot.contractExists) return;

    // Cumulative: per-invoice checks are defeated by splitting one over-cap invoice into two.
    // Compared NET of VAT throughout — contract values and certified figures are VAT-exclusive,
    // so summing VAT-inclusive totals would refuse a correct final invoice by exactly the tax.
    const existing = await this.store.list({ tenantId: input.tenantId, limit: 500 });
    const alreadyInvoiced = existing
      .filter((i) => i.contractRef === contractId && i.status !== 'cancelled' && !i.deletedAt)
      .reduce((sum, i) => sum + i.subtotal, 0);

    const verdict = evaluateContractCap({ snapshot, alreadyInvoiced, newInvoiceTotal: newInvoiceNet });
    if (!verdict.withinCap) {
      // "cannot"/"exceeds" phrasing maps to 409 via the error taxonomy — a state conflict, not
      // a malformed request.
      throw new Error(`cannot raise invoice: ${verdict.reason}`);
    }
  }

  private async ensureAccount(tenantId: string, code: string, name: string, type: AccountType) {
    const existing = await this.accounts.getByCode(tenantId, code);
    return existing ?? this.accounts.create({ tenantId, code, name, type });
  }

  /** Compute the AR FX revaluation and post the unrealized gain/loss journal to the GL. */
  async postFxRevaluation(tenantId: string, asOf?: string, actorId?: Id): Promise<{ revaluation: Awaited<ReturnType<CustomerInvoiceService['fxRevaluation']>>; journalId: string | null }> {
    const reval = await this.fxRevaluation(tenantId, asOf);
    /**
     * AN INCOMPLETE REVALUATION IS NOT POSTED (FX-01). A partial total posted to the ledger states
     * that the exposure it could not measure did not move. Refuse, and name what is missing.
     */
    if (!reval.complete) {
      const [first] = reval.unresolved;
      throw new Error(`the AR FX revaluation as of ${reval.asOf} is incomplete and cannot be posted — ${first.detail}`);
    }
    const gl = moneyNumber(reval.totalGainLoss);
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

  /**
   * RESOLVE THE BOOKING RATE, OR REFUSE THE INVOICE (FX-01).
   *
   * Before the invoice is built and long before anything is saved or any event appended, so the
   * refusal leaves nothing behind. Governed AT THE ISSUE DATE — an invoice issued last month is
   * worth last month's rate, not today's. An explicit rate from the caller is their assertion and
   * is left alone, with no governed provenance recorded, because AURA did not govern it.
   */
  private async valueInBaseCurrency(input: NewCustomerInvoice): Promise<NewCustomerInvoice> {
    if (input.exchangeRate !== undefined) return input;
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate ?? '') ? new Date(input.issueDate) : new Date();
    const rate = await this.fx.requireGovernedRate(input.tenantId, input.currency ?? 'AED', 'AED', asOf);
    return {
      ...input,
      exchangeRate: rate.rate,
      exchangeRateEffectiveDate: rate.effectiveDate,
      exchangeRateSource: rate.source,
      exchangeRateId: rate.rateId,
    };
  }

  async create(input: NewCustomerInvoice): Promise<CustomerInvoice> {
    input = await this.valueInBaseCurrency(input);
    const inv = makeCustomerInvoice(input);
    // Invoice numbers are the legal identifier on an AR document and the key the customer, the FTA
    // VAT return and the audit trail all cite. They are user-supplied here (unlike AP references,
    // which the numbering service generates), so nothing stopped two different invoices sharing a
    // number. Reject a duplicate live number within the tenant — "already exists" → 409. A number
    // freed by a soft-deleted/cancelled invoice may be reused (existsByNumber ignores deleted).
    if (await this.store.existsByNumber(inv.tenantId, inv.invoiceNumber)) {
      throw new Error(`customer invoice number ${inv.invoiceNumber} already exists`);
    }
    await this.assertWithinContractCap(input, inv.subtotal);
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
    // Tenant boundary (G-03): assert ownership before issuing — see tenant-guard.ts.
    const inv = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'customer invoice', id);
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
    // Tenant boundary (G-03): a receipt must not post against another tenant's invoice.
    const inv = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'customer invoice', id);
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
    // Tenant boundary (G-03): cancelling is a mutation — assert ownership first.
    const inv = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'customer invoice', id);
    const updated = cancelInvoice(inv);
    await this.store.save(updated);
    // Voiding a receivable is an auditable financial act — it must leave a trace on the spine, as
    // create/issue/receipt already do. Without this, a cancelled invoice vanished silently.
    await this.events.append([
      makeEvent({
        type: CUSTOMER_INVOICE_EVENT.cancelled,
        tenantId: inv.tenantId, companyId: inv.companyId, actorId: null,
        aggregateType: 'finance.customer_invoice', aggregateId: id,
        payload: { invoiceNumber: inv.invoiceNumber, total: inv.total },
      }),
    ]);
    this.logger.log(`Customer invoice ${inv.invoiceNumber} (${id}) cancelled`);
    return updated;
  }

  async get(id: Id): Promise<CustomerInvoice | null> {
    // Getter keeps its null contract but will not return another tenant's invoice.
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: CustomerInvoiceFilter): Promise<CustomerInvoice[]> {
    return this.store.list(filter);
  }

  softDelete(tenantId: Id, id: Id): Promise<void> { return this.store.setDeleted(tenantId, id, true); }
  restore(tenantId: Id, id: Id): Promise<void> { return this.store.setDeleted(tenantId, id, false); }

  listPaged(filter: CustomerInvoiceFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** FX revaluation — unrealized gain/loss on open foreign-currency AR at current rates. */
  async fxRevaluation(tenantId: string, asOf?: string, baseCurrency = 'AED') {
    const all = await this.store.list({ tenantId, limit: 1000 });
    const on = asOf ?? new Date().toISOString().slice(0, 10);
    /**
     * The CURRENT rate is resolved AT THE REVALUATION DATE, not at today (FX-01), and a currency
     * with no governed rate at that date maps to null so its invoices come back unresolved rather
     * than as a flat position.
     */
    const rateCache = new Map<string, number | null>();
    for (const inv of all) {
      const c = (inv.currency ?? baseCurrency).toUpperCase();
      if (c !== baseCurrency && !rateCache.has(c)) {
        const resolved = await this.fx.resolveGovernedRate(tenantId, c, baseCurrency, new Date(on));
        rateCache.set(c, resolved.status === 'governed' ? resolved.rate : null);
      }
    }
    return computeFxRevaluation(
      // The BOOKED rate is read off the document as persisted and is never re-resolved.
      all.map((i) => ({ invoiceNumber: i.invoiceNumber, currency: i.currency ?? baseCurrency, exchangeRate: i.exchangeRate, total: i.total, amountPaid: i.amountPaid, status: i.status })),
      (c) => rateCache.get(c) ?? null,
      on,
      baseCurrency,
    );
  }

  /** AR aging — outstanding receivables bucketed by overdue age, as of `asOf` (default today). */
  async aging(tenantId: string, asOf?: string): Promise<ArAgingReport> {
    const all = await this.store.list({ tenantId, limit: 1000 });
    return buildArAging(all, asOf ?? new Date().toISOString().slice(0, 10));
  }
}
