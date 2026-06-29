import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
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
import { CUSTOMER_INVOICE_STORE, type CustomerInvoiceFilter, type CustomerInvoiceStore } from './customer-invoice-store';

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
  ) {}

  async create(input: NewCustomerInvoice): Promise<CustomerInvoice> {
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

  /** AR aging — outstanding receivables bucketed by overdue age, as of `asOf` (default today). */
  async aging(tenantId: string, asOf?: string): Promise<ArAgingReport> {
    const all = await this.store.list({ tenantId, limit: 1000 });
    return buildArAging(all, asOf ?? new Date().toISOString().slice(0, 10));
  }
}
