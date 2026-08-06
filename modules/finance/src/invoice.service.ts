import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId, diffFields } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner, ExchangeRateService, AccessService, TenantContext } from '@aura/core';
import type { Currency } from '@aura/shared';
import { FINANCE_EVENT, type Invoice, type InvoiceStatus, type NewInvoice, makeInvoice } from './domain/invoice';
import { type ApAgingReport, buildApAging } from './domain/ap-aging';
import { computeFxRevaluation } from './domain/fx-revaluation';
import { INVOICE_STORE, type InvoiceFilter, type InvoiceStore } from './invoice-store';
import { PAYMENT_STORE, type PaymentStore } from './payment-store';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';
import type { AccountType } from './domain/account';
import { PO_MATCH_PORT, type PoMatchPort } from './po-match.port';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';

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
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly fx: ExchangeRateService,
    private readonly journals: JournalService,
    private readonly accounts: AccountService,
    private readonly access: AccessService,
    // Cross-context data for the 3-way match — bound by the app layer (ADR-0004). Optional so the
    // module is self-contained; when unbound the match is skipped (mirrors procurement's gate).
    @Optional() @Inject(PO_MATCH_PORT) private readonly poMatch?: PoMatchPort,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    // Read-only access to the payment ledger for AP aging (remaining balance = value − paid).
    // The store token, not PaymentService, to avoid a circular dep (payment depends on invoice).
    @Optional() @Inject(PAYMENT_STORE) private readonly payments: PaymentStore | null = null,
  ) {}

  /** The acting user for an audit record: the real request actor (ALS) when known, else null. */
  private actor(): Id | null {
    return this.tenant?.get().actorId ?? null;
  }

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
    // Tenant-scoped read: a wrong-tenant id is indistinguishable from a missing one, so the
    // match reports "not found" rather than validating against another tenant's invoice.
    const invoice = sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
    if (!invoice) return { matched: false, reason: 'Invoice not found' };
    if (!invoice.poId) return { matched: true }; // non-PO invoice passes match
    if (!this.poMatch) return { matched: true }; // no data source bound → skip (mirrors gate pattern)

    // The cross-context data (PO value + received-GRN value) comes through the Finance-owned port;
    // the match *rule* below stays Finance's.
    const snap = await this.poMatch.getSnapshot(invoice.tenantId, invoice.poId);
    if (!snap.poExists) return { matched: false, reason: `PO ${invoice.poId} not found` };

    // Cumulative match: already-committed invoices against this PO count too. A per-invoice check
    // let N invoices each ≤ received collectively over-bill — e.g. two 100k invoices against a 100k
    // PO with 100k received both passed, double-paying the supplier. Sum the approved/paid siblings
    // (drafts are not yet a claim; cancelled do not count) and test the running total.
    const siblings = await this.store.list({ tenantId: invoice.tenantId, poId: invoice.poId });
    const alreadyInvoiced = siblings
      .filter((i) => i.id !== invoice.id && (i.status === 'approved' || i.status === 'paid'))
      .reduce((s, i) => s + (i.value || 0), 0);
    const cumulative = Math.round((alreadyInvoiced + invoice.value) * 100) / 100;

    if (cumulative > snap.poValue + 0.01) {
      return {
        matched: false,
        reason: `cumulative invoiced (${cumulative}) exceeds PO value (${snap.poValue}) — ${alreadyInvoiced} already approved on this PO`,
      };
    }

    if (cumulative > snap.receivedValue + 0.01) {
      return {
        matched: false,
        reason: `cumulative invoiced (${cumulative}) exceeds total received GRN value (${snap.receivedValue}) — ${alreadyInvoiced} already approved on this PO`,
      };
    }

    return { matched: true };
  }

  /** Update descriptive fields on an invoice (title, reference, supplier snapshot).
   *  Value is NOT editable — actual project cost was posted as a delta at creation. */
  async update(id: Id, patch: Partial<Pick<Invoice, 'title' | 'reference' | 'supplierName'>>): Promise<Invoice> {
    // Tenant boundary (G-03): the store fetches by id alone and RLS is inert at runtime, so the
    // service asserts ownership before writing. Wrong tenant → "not found", never a cross-tenant edit.
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'invoice', id);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Invoice = { ...existing, ...defined };
    // Audit trail (P1-2): field-level before→after + the real actor, for the record History.
    const changes = diffFields(existing, updated, ['title', 'reference', 'supplierName']);
    const event = makeEvent({
      type: FINANCE_EVENT.invoiceUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: this.actor(),
      aggregateType: 'finance.invoice',
      aggregateId: updated.id,
      payload: { title: updated.title, value: updated.value, changes },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Invoice updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  async changeStatus(id: Id, status: InvoiceStatus, actorId?: Id): Promise<Invoice> {
    // Tenant boundary (G-03) before any state change — approve/pay a foreign invoice is refused
    // with the same "not found" a missing id gets. See update() above.
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'invoice', id);

    if (status === 'approved') {
      // Segregation of duties: the preparer may not approve their own invoice. Skipped for
      // system/auto transitions (no actor).
      if (actorId && existing.createdBy && actorId === existing.createdBy) {
        throw new Error(
          `access denied: the preparer of invoice ${existing.reference ?? id} cannot approve their own invoice — segregation of duties requires a different approver`,
        );
      }
      // Value-threshold approval (P0-3): the approver's grant must carry enough approvalLimit for the
      // invoice value. Skipped for system/auto transitions. Reuses the ABAC ceiling.
      if (actorId) {
        this.access.assertApprovalAuthority(
          actorId,
          { permission: 'finance.invoice.approve', orgPath: [{ level: 'tenant', id: existing.tenantId }], amount: existing.value },
          `invoice ${existing.reference ?? id} approval`,
        );
      }
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
        // baseValue lets the GL reactor book the payable in base currency at the invoice's rate.
        baseValue: updated.baseValue,
        currency: updated.currency,
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

  async get(id: Id): Promise<Invoice | null> {
    // Getter keeps its null contract but will not return another tenant's invoice.
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: InvoiceFilter): Promise<Invoice[]> {
    return this.store.list(filter);
  }

  listPaged(filter: InvoiceFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** AP aging — approved supplier liability (fully or partially unpaid) bucketed by invoice-date
   *  age. A partially-paid invoice is still `approved`, so it ages at its REMAINING balance
   *  (value − payments to date), not its full value. */
  async aging(tenantId: string, asOf?: string): Promise<ApAgingReport> {
    const all = await this.store.list({ tenantId, status: 'approved', limit: 1000 });
    return buildApAging(all, asOf ?? new Date().toISOString().slice(0, 10), await this.paidByInvoice(tenantId));
  }

  /** Amount paid to date per invoice, summed from the payment ledger (invoice currency). A
   *  partially-paid AP invoice stays `approved`, so its remaining balance — not its full value —
   *  is the live exposure for aging and FX revaluation alike. */
  private async paidByInvoice(tenantId: string): Promise<Map<string, number>> {
    const paid = new Map<string, number>();
    if (this.payments) {
      for (const p of await this.payments.list({ tenantId })) {
        paid.set(p.invoiceId, (paid.get(p.invoiceId) ?? 0) + p.amount);
      }
    }
    return paid;
  }

  /** FX revaluation — unrealized gain/loss on open foreign-currency AP at current rates. */
  async fxRevaluation(tenantId: string, asOf?: string, baseCurrency = 'AED') {
    const all = await this.store.list({ tenantId, status: 'approved', limit: 1000 });
    const paid = await this.paidByInvoice(tenantId);
    const rateCache = new Map<string, number>();
    for (const inv of all) {
      const c = (inv.currency ?? baseCurrency).toUpperCase();
      if (c !== baseCurrency && !rateCache.has(c)) {
        rateCache.set(c, await this.fx.getRate(tenantId, c as Currency, baseCurrency as Currency));
      }
    }
    return computeFxRevaluation(
      // Only the UNPAID balance carries FX exposure — a partially-paid invoice is still 'approved',
      // so revaluing its full value overstated the unrealized gain/loss and the GL journal it posts.
      all.map((i) => ({ invoiceNumber: i.reference ?? i.id, currency: i.currency ?? baseCurrency, exchangeRate: i.exchangeRate ?? 1, total: i.value, amountPaid: paid.get(i.id) ?? 0, status: i.status })),
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
