import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { FINANCE_EVENT, type Invoice, type NewInvoice, makeInvoice } from './domain/invoice';
import { INVOICE_STORE, type InvoiceFilter, type InvoiceStore } from './invoice-store';

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
  ) {}

  async create(input: NewInvoice): Promise<Invoice> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'finance.invoice.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const invoice = makeInvoice(input);
    await this.store.create(invoice);
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

  get(id: Id): Promise<Invoice | null> {
    return this.store.get(id);
  }

  list(filter?: InvoiceFilter): Promise<Invoice[]> {
    return this.store.list(filter);
  }
}
