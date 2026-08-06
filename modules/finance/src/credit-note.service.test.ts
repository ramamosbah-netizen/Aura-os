import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { CustomerInvoiceService } from './customer-invoice.service';
import { InMemoryCustomerInvoiceStore } from './in-memory-customer-invoice-store';
import { CreditNoteService } from './credit-note.service';
import { InMemoryCreditNoteStore } from './in-memory-credit-note-store';
import { balanceOf } from './domain/customer-invoice';

const TENANT = 't1';

function harness() {
  const invStore = new InMemoryCustomerInvoiceStore();
  const cnStore = new InMemoryCreditNoteStore();
  const append = vi.fn().mockResolvedValue(undefined);
  const invoices = new CustomerInvoiceService(invStore, { append } as unknown as EventStore, {} as never, {} as never, {} as never);
  const creditNotes = new CreditNoteService(cnStore, { append } as unknown as EventStore, invoices);
  return { invStore, invoices, creditNotes, append };
}

/** An issued AR invoice: net 1,000 + 5% VAT = 1,050 gross. */
async function issuedInvoice(invoices: CustomerInvoiceService, net = 1000) {
  const inv = await invoices.create({
    tenantId: TENANT, invoiceNumber: 'AR-1', customerName: 'Acme', issueDate: '2026-01-10',
    lines: [{ description: 'work', quantity: 1, unitPrice: net, vatRate: 5 }],
  });
  await invoices.issue(inv.id);
  return inv;
}

const emitted = (append: ReturnType<typeof vi.fn>): string[] =>
  append.mock.calls.flatMap((c) => (c[0] as Array<{ type: string }>).map((e) => e.type));

const noteInput = (invoiceId: string, net: number, number = 'CN-1') => ({
  tenantId: TENANT, creditNoteNumber: number, customerInvoiceId: invoiceId, customerName: 'Acme',
  reason: 'over-billing', issueDate: '2026-01-20',
  lines: [{ description: 'correction', quantity: 1, unitPrice: net, vatRate: 5 }],
});

describe('CreditNoteService', () => {
  it('issuing a credit note reduces the target invoice balance and emits the GL trigger', async () => {
    const { invoices, creditNotes, append } = harness();
    const inv = await issuedInvoice(invoices); // 1,050 gross

    const cn = await creditNotes.create(noteInput(inv.id, 400)); // 420 gross
    await creditNotes.issue(cn.id);

    const after = await invoices.get(inv.id);
    expect(after!.creditedTotal).toBeCloseTo(420, 2);
    expect(balanceOf(after!)).toBeCloseTo(630, 2); // 1,050 − 420
    // The issued event carries net/VAT for the GL reactor.
    expect(emitted(append)).toContain('finance.credit_note.issued');
  });

  it('fully crediting an invoice settles it', async () => {
    const { invoices, creditNotes } = harness();
    const inv = await issuedInvoice(invoices);
    const cn = await creditNotes.create(noteInput(inv.id, 1000)); // full net → 1,050 gross
    await creditNotes.issue(cn.id);
    expect((await invoices.get(inv.id))!.status).toBe('paid');
  });

  it('rejects crediting more, net, than the invoice was billed', async () => {
    const { invoices, creditNotes } = harness();
    const inv = await issuedInvoice(invoices); // net 1,000
    await expect(creditNotes.create(noteInput(inv.id, 1500))).rejects.toThrow(/above the invoice net/);
  });

  it('rejects a second credit note that would over-credit the invoice', async () => {
    const { invoices, creditNotes } = harness();
    const inv = await issuedInvoice(invoices);
    await creditNotes.issue((await creditNotes.create(noteInput(inv.id, 700, 'CN-1'))).id);
    // 700 + 400 = 1,100 net > 1,000 billed
    await expect(creditNotes.create(noteInput(inv.id, 400, 'CN-2'))).rejects.toThrow(/above the invoice net/);
  });

  it('rejects a duplicate credit-note number in the tenant', async () => {
    const { invoices, creditNotes } = harness();
    const inv = await issuedInvoice(invoices);
    await creditNotes.create(noteInput(inv.id, 100, 'CN-DUP'));
    await expect(creditNotes.create(noteInput(inv.id, 100, 'CN-DUP'))).rejects.toThrow(/already exists/);
  });

  it('cannot credit a draft invoice', async () => {
    const { invoices, creditNotes } = harness();
    const draft = await invoices.create({
      tenantId: TENANT, invoiceNumber: 'AR-2', customerName: 'Acme', issueDate: '2026-01-10',
      lines: [{ description: 'work', quantity: 1, unitPrice: 500 }],
    });
    await expect(creditNotes.create(noteInput(draft.id, 100))).rejects.toThrow(/only an issued invoice can be credited/);
  });

  it('cannot issue the same credit note twice', async () => {
    const { invoices, creditNotes } = harness();
    const inv = await issuedInvoice(invoices);
    const cn = await creditNotes.create(noteInput(inv.id, 100));
    await creditNotes.issue(cn.id);
    await expect(creditNotes.issue(cn.id)).rejects.toThrow(/only a draft credit note can be issued/);
  });
});
