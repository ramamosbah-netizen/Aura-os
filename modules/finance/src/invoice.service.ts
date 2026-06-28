import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, NumberingService, AuditService } from '@aura/core';
import { FINANCE_EVENT, type Invoice, type InvoiceStatus, type NewInvoice, makeInvoice } from './domain/invoice';
import { INVOICE_STORE, type InvoiceFilter, type InvoiceStore } from './invoice-store';
import { PurchaseOrderService } from '@aura/procurement';
import { GoodsReceiptService, type GoodsReceipt } from '@aura/inventory';

/**
 * Finance service — bills against a PO, closing the operate loop (spend -> receive -> pay).
 * Owns `aura_finance_invoices`, goes through the access seam, and emits `finance.invoice.*`
 * on the spine. References the PO + carries supplier/project down by snapshot — no DB join.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger('Finance');

  constructor(
    @Inject(INVOICE_STORE) private readonly store: InvoiceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly goodsReceipts: GoodsReceiptService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(input: NewInvoice): Promise<Invoice> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'finance.invoice.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const invoice = makeInvoice(input);
    if (!invoice.reference) {
      invoice.reference = await this.numbering.generateNextNumber(
        invoice.tenantId,
        invoice.companyId,
        'finance',
        'invoice',
        'INV',
      );
    }

    await this.store.create(invoice);

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

    await this.events.append([
      makeEvent({
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
      }),
    ]);
    this.logger.log(`Invoice created: ${invoice.title} (${invoice.id}) value=${invoice.value}`);
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
    await this.store.update(updated);

    let eventType: string = FINANCE_EVENT.invoiceUpdated;
    if (status === 'approved') {
      eventType = FINANCE_EVENT.invoiceApproved;
    } else if (status === 'paid') {
      eventType = FINANCE_EVENT.invoicePaid;
    }

    await this.events.append([
      makeEvent({
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
      }),
    ]);
    this.logger.log(`Invoice ${updated.title} (${updated.id}) status changed to ${status}`);
    return updated;
  }

  get(id: Id): Promise<Invoice | null> {
    return this.store.get(id);
  }

  list(filter?: InvoiceFilter): Promise<Invoice[]> {
    return this.store.list(filter);
  }
}
