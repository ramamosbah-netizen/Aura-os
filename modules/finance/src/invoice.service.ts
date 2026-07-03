import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner, ExchangeRateService } from '@aura/core';
import type { Currency } from '@aura/shared';
import { FINANCE_EVENT, type Invoice, type InvoiceStatus, type NewInvoice, makeInvoice } from './domain/invoice';
import { type ApAgingReport, buildApAging } from './domain/ap-aging';
import { computeFxRevaluation } from './domain/fx-revaluation';
import { INVOICE_STORE, type InvoiceFilter, type InvoiceStore } from './invoice-store';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import type { AccountType } from './domain/account';
import { PurchaseOrderService } from '@aura/procurement';
import { GoodsReceiptService, type GoodsReceipt } from '@aura/inventory';

/** AP invoices are "open" (revaluable) when approved-but-unpaid. */
const AP_OPEN = ['approved'];

const CREATE_INVOICE = 'finance.invoice.create';

/**
 * Finance service — bills against a PO, closing the operate loop (spend -> receive -> pay).
 * Owns `aura_finance_invoices`, emits `finance.invoice.*` on the spine. References the PO +
 * carries supplier/project down by snapshot — no DB join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency → one tx
 * → atomic row + outbox event), with the reference number generated inside the handler.
 * `changeStatus` keeps its inline atomic TX_RUNNER write — it runs the 3-way match gate first
 * and its invoice.paid event drives actual-cost logging.
 */
@Injectable()
export class InvoiceService implements OnModuleInit {
  private readonly logger = new Logger('Finance');

  constructor(
    @Inject(INVOICE_STORE) private readonly store: InvoiceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly goodsReceipts: GoodsReceiptService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly fx: ExchangeRateService,
    private readonly journals: JournalService,
    private readonly accounts: AccountService,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewInvoice, Invoice>({
      name: CREATE_INVOICE,
      permission: 'finance.invoice.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('invoice title is required');
      },
      handler: async (command, tx) => {
        const invoice = makeInvoice(command.payload);
        if (!invoice.reference) {
          invoice.reference = await this.numbering.generateNextNumber(
            invoice.tenantId,
            invoice.companyId,
            'finance',
            'invoice',
            'INV',
          );
        }
        const event = makeEvent({
          type: FINANCE_EVENT.invoiceCreated,
          tenantId: invoice.tenantId,
          companyId: invoice.companyId,
          actorId: invoice.createdBy,
          aggregateType: 'finance.invoice',
          aggregateId: invoice.id,
          payload: {
            title: invoice.title,
            status: invoice.status,
            value: invoice.value,
            supplier: invoice.supplierName,
            po: invoice.poId ? { id: invoice.poId, title: invoice.poTitle } : null,
            project: invoice.projectId ? { id: invoice.projectId, name: invoice.projectName } : null,
          },
        });
        await this.store.createWithClient(tx, invoice);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`Invoice created: ${invoice.title} (${invoice.id}) value=${invoice.value}`);
        return invoice;
      },
    });
  }

  async create(input: NewInvoice, idempotencyKey?: string | null): Promise<Invoice> {
    // Multi-currency: resolve the effective rate to base for a non-AED AP invoice without an explicit rate.
    const currency = (input.currency ?? 'AED').toUpperCase();
    if (currency !== 'AED' && input.exchangeRate === undefined) {
      input = { ...input, exchangeRate: await this.fx.getRate(input.tenantId, currency as Currency, 'AED') };
    }
    const invoice = await this.commands.execute<Invoice>({
      id: newId(),
      name: CREATE_INVOICE,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
    await this.audit.log(
      invoice.tenantId,
      invoice.companyId,
      invoice.createdBy,
      'finance',
      'invoice',
      invoice.id,
      'create',
      { reference: invoice.reference, value: invoice.value },
    );
    return invoice;
  }

  async checkThreeWayMatch(id: Id): Promise<{ matched: boolean; reason?: string }> {
    const invoice = await this.store.get(id);
    if (!invoice) return { matched: false, reason: 'Invoice not found' };
    if (!invoice.poId) return { matched: true }; // non-PO invoice passes match

    const po = await this.purchaseOrders.get(invoice.poId);
    if (!po) return { matched: false, reason: `PO ${invoice.poId} not found` };

    if (invoice.value > po.value) {
      return {
        matched: false,
        reason: `Invoice value (${invoice.value}) exceeds PO value (${po.value})`,
      };
    }

    const grns: GoodsReceipt[] = await this.goodsReceipts.list({ poId: invoice.poId });
    const receivedValue = grns
      .filter((g: GoodsReceipt) => g.status === 'received')
      .reduce((sum: number, g: GoodsReceipt) => sum + g.value, 0);

    if (invoice.value > receivedValue) {
      return {
        matched: false,
        reason: `Invoice value (${invoice.value}) exceeds total received GRN value (${receivedValue})`,
      };
    }

    return { matched: true };
  }

  /** Update descriptive fields on an invoice (title, reference, supplier snapshot).
   *  Value is NOT editable — actual project cost was posted as a delta at creation. */
  async update(id: Id, patch: Partial<Pick<Invoice, 'title' | 'reference' | 'supplierName'>>): Promise<Invoice> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Invoice ${id} not found`);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Invoice = { ...existing, ...defined };
    const event = makeEvent({
      type: FINANCE_EVENT.invoiceUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'finance.invoice',
      aggregateId: updated.id,
      payload: { title: updated.title, value: updated.value },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Invoice updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  async changeStatus(id: Id, status: InvoiceStatus): Promise<Invoice> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Invoice ${id} not found`);

    if (status === 'approved') {
      const match = await this.checkThreeWayMatch(id);
      if (!match.matched) {
        throw new Error(`3-Way Match validation failed: ${match.reason}`);
      }
    }

    const updated: Invoice = { ...existing, status };

    let eventType: string = FINANCE_EVENT.invoiceUpdated;
    if (status === 'approved') {
      eventType = FINANCE_EVENT.invoiceApproved;
    } else if (status === 'paid') {
      eventType = FINANCE_EVENT.invoicePaid;
    }

    const event = makeEvent({
      type: eventType,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'finance.invoice',
      aggregateId: updated.id,
      payload: {
        title: updated.title,
        status: updated.status,
        value: updated.value,
        supplier: updated.supplierName,
        po: updated.poId ? { id: updated.poId, title: updated.poTitle } : null,
        project: updated.projectId ? { id: updated.projectId, name: updated.projectName } : null,
        wbsNodeId: updated.wbsNodeId,
      },
    });

    // Atomic: the status update and its event commit together.
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Invoice ${updated.title} (${updated.id}) status changed to ${status}`);
    return updated;
  }

  get(id: Id): Promise<Invoice | null> {
    return this.store.get(id);
  }

  list(filter?: InvoiceFilter): Promise<Invoice[]> {
    return this.store.list(filter);
  }

  listPaged(filter: InvoiceFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** AP aging — approved-but-unpaid supplier liability bucketed by invoice-date age. */
  async aging(tenantId: string, asOf?: string): Promise<ApAgingReport> {
    const all = await this.store.list({ tenantId, status: 'approved', limit: 1000 });
    return buildApAging(all, asOf ?? new Date().toISOString().slice(0, 10));
  }

  /** FX revaluation — unrealized gain/loss on open foreign-currency AP at current rates. */
  async fxRevaluation(tenantId: string, asOf?: string, baseCurrency = 'AED') {
    const all = await this.store.list({ tenantId, status: 'approved', limit: 1000 });
    const rateCache = new Map<string, number>();
    for (const inv of all) {
      const c = (inv.currency ?? baseCurrency).toUpperCase();
      if (c !== baseCurrency && !rateCache.has(c)) {
        rateCache.set(c, await this.fx.getRate(tenantId, c as Currency, baseCurrency as Currency));
      }
    }
    return computeFxRevaluation(
      // AP has no partial payments: outstanding = full value while approved.
      all.map((i) => ({ invoiceNumber: i.reference ?? i.id, currency: i.currency ?? baseCurrency, exchangeRate: i.exchangeRate ?? 1, total: i.value, amountPaid: 0, status: i.status })),
      (c) => rateCache.get(c) ?? 1,
      asOf ?? new Date().toISOString().slice(0, 10),
      baseCurrency,
      AP_OPEN,
    );
  }

  private async ensureAccount(tenantId: string, code: string, name: string, type: AccountType) {
    const existing = await this.accounts.getByCode(tenantId, code);
    return existing ?? this.accounts.create({ tenantId, code, name, type });
  }

  /** Compute the AP FX revaluation and post the unrealized gain/loss journal to the GL. */
  async postFxRevaluation(tenantId: string, asOf?: string, actorId?: Id): Promise<{ revaluation: Awaited<ReturnType<InvoiceService['fxRevaluation']>>; journalId: string | null }> {
    const reval = await this.fxRevaluation(tenantId, asOf);
    // AP is a credit-normal liability: a higher current rate means we owe MORE in base terms,
    // so a positive delta (base@current − base@booked) is an economic LOSS. Invert for P&L.
    const economicGain = Math.round(-reval.totalGainLoss * 100) / 100;
    if (economicGain === 0) return { revaluation: reval, journalId: null };

    const apControl = await this.ensureAccount(tenantId, '2010', 'Accounts Payable', 'liability');
    const gainAcc = await this.ensureAccount(tenantId, '4900', 'FX Gain (unrealized)', 'revenue');
    const lossAcc = await this.ensureAccount(tenantId, '5900', 'FX Loss (unrealized)', 'expense');
    const amount = Math.abs(economicGain);
    // gain (owe less): Dr AP / Cr FX gain · loss (owe more): Dr FX loss / Cr AP
    const lines = economicGain > 0
      ? [{ accountId: apControl.id, accountCode: apControl.code, accountName: apControl.name, debit: amount, credit: 0 },
         { accountId: gainAcc.id, accountCode: gainAcc.code, accountName: gainAcc.name, debit: 0, credit: amount }]
      : [{ accountId: lossAcc.id, accountCode: lossAcc.code, accountName: lossAcc.name, debit: amount, credit: 0 },
         { accountId: apControl.id, accountCode: apControl.code, accountName: apControl.name, debit: 0, credit: amount }];
    const journal = await this.journals.post({ tenantId, description: `Unrealized FX revaluation (AP) as of ${reval.asOf}`, reference: `FXREVAL-AP-${reval.asOf}`, lines }, actorId);
    this.logger.log(`Posted AP FX revaluation ${reval.asOf}: ${economicGain > 0 ? 'gain' : 'loss'} ${amount} (journal ${journal.id})`);
    return { revaluation: reval, journalId: journal.id };
  }
}
