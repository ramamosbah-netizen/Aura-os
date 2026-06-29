import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, NumberingService, AuditService, TX_RUNNER, type TxRunner } from '@aura/core';
import { FINANCE_EVENT, type Invoice, type InvoiceStatus, type NewInvoice, makeInvoice } from './domain/invoice';
import { type ApAgingReport, buildApAging } from './domain/ap-aging';
import { INVOICE_STORE, type InvoiceFilter, type InvoiceStore } from './invoice-store';
import { PurchaseOrderService } from '@aura/procurement';
import { GoodsReceiptService, type GoodsReceipt } from '@aura/inventory';

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

  /** AP aging — approved-but-unpaid supplier liability bucketed by invoice-date age. */
  async aging(tenantId: string, asOf?: string): Promise<ApAgingReport> {
    const all = await this.store.list({ tenantId, status: 'approved', limit: 1000 });
    return buildApAging(all, asOf ?? new Date().toISOString().slice(0, 10));
  }
}
