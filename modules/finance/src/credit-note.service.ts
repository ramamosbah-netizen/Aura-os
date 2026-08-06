import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  CREDIT_NOTE_EVENT,
  type CreditNote,
  type NewCreditNote,
  makeCreditNote,
  issueCreditNote,
  cancelCreditNote,
} from './domain/credit-note';
import { CREDIT_NOTE_STORE, type CreditNoteFilter, type CreditNoteStore } from './credit-note-store';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';
import { CustomerInvoiceService } from './customer-invoice.service';

/**
 * AR credit-note service — owns `aura_finance_credit_notes`, emits `finance.credit_note.*`.
 * Issuing a note (a) reduces the target invoice's receivable and (b) posts the GL reversal via the
 * `finance.credit_note.issued` reactor (Dr Revenue + Dr VAT / Cr AR).
 */
@Injectable()
export class CreditNoteService {
  private readonly logger = new Logger('CreditNote');

  constructor(
    @Inject(CREDIT_NOTE_STORE) private readonly store: CreditNoteStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly invoices: CustomerInvoiceService,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewCreditNote): Promise<CreditNote> {
    // The note must target a live invoice in the same tenant, and that invoice must be billable
    // (issued / partially_paid) — you cannot credit a draft or an already-cancelled invoice.
    const invoice = assertSameTenant(await this.invoices.get(input.customerInvoiceId), input.tenantId, 'customer invoice', input.customerInvoiceId);
    if (invoice.status !== 'issued' && invoice.status !== 'partially_paid' && invoice.status !== 'paid') {
      throw new Error(`only an issued invoice can be credited (invoice ${invoice.invoiceNumber} is ${invoice.status})`);
    }
    const note = makeCreditNote({ ...input, invoiceNumber: input.invoiceNumber ?? invoice.invoiceNumber, customerName: input.customerName || invoice.customerName });
    if (await this.store.existsByNumber(note.tenantId, note.creditNoteNumber)) {
      throw new Error(`credit note number ${note.creditNoteNumber} already exists`);
    }
    // Cannot credit more, net, than the invoice was billed for (across all its notes).
    const priorNet = (await this.store.list({ tenantId: note.tenantId, customerInvoiceId: note.customerInvoiceId }))
      .filter((n) => n.status !== 'cancelled')
      .reduce((s, n) => s + n.subtotal, 0);
    if (priorNet + note.subtotal > invoice.subtotal + 0.001) {
      // "insufficient …" leads so the error taxonomy classifies this as a 409 state conflict
      // (the invoice's billed value forbids further credit), mirroring the over-payment guard.
      throw new Error(`insufficient invoice value — crediting ${note.subtotal} would take credits to ${priorNet + note.subtotal}, above the invoice net of ${invoice.subtotal}`);
    }
    await this.store.save(note);
    await this.events.append([
      makeEvent({
        type: CREDIT_NOTE_EVENT.created,
        tenantId: note.tenantId, companyId: note.companyId, actorId: note.createdBy,
        aggregateType: 'finance.credit_note', aggregateId: note.id,
        payload: { creditNoteNumber: note.creditNoteNumber, customerInvoiceId: note.customerInvoiceId, total: note.total },
      }),
    ]);
    this.logger.log(`Credit note ${note.creditNoteNumber} drafted against invoice ${note.invoiceNumber}: total ${note.total}`);
    return note;
  }

  async issue(id: Id): Promise<CreditNote> {
    const note = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'credit note', id);
    const updated = issueCreditNote(note); // draft → issued (throws otherwise)
    // Reduce the receivable on the target invoice first — this also re-asserts the balance guard.
    await this.invoices.applyCredit(note.customerInvoiceId, note.total);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CREDIT_NOTE_EVENT.issued,
        tenantId: note.tenantId, companyId: note.companyId, actorId: null,
        aggregateType: 'finance.credit_note', aggregateId: id,
        // Carries net / VAT / currency so the GL reactor posts the reversal in base currency.
        payload: {
          creditNoteNumber: note.creditNoteNumber, customerInvoiceId: note.customerInvoiceId,
          subtotal: note.subtotal, vatTotal: note.vatTotal, total: note.total,
          currency: note.currency, exchangeRate: note.exchangeRate,
        },
      }),
    ]);
    this.logger.log(`Credit note ${note.creditNoteNumber} issued → reduced invoice ${note.invoiceNumber} by ${note.total}`);
    return updated;
  }

  async cancel(id: Id): Promise<CreditNote> {
    const note = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'credit note', id);
    const updated = cancelCreditNote(note); // draft → cancelled (throws if already issued)
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CREDIT_NOTE_EVENT.cancelled,
        tenantId: note.tenantId, companyId: note.companyId, actorId: null,
        aggregateType: 'finance.credit_note', aggregateId: id,
        payload: { creditNoteNumber: note.creditNoteNumber },
      }),
    ]);
    return updated;
  }

  async get(id: Id): Promise<CreditNote | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: CreditNoteFilter): Promise<CreditNote[]> {
    return this.store.list(filter);
  }

  listPaged(filter: CreditNoteFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
