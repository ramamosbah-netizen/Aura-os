import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import {
  assertSoftDeletable, cancelInvoice, cancellationSeparation, issueInvoice, type CustomerInvoice,
} from '@aura/finance';
import { FinanceController } from './finance.controller';

/**
 * CUSTOMER INVOICING — SEC-01 stage 3, wave A.
 *
 * Measured against the running API. `created_by` is on the row and the `created` event names the
 * actor. EVERY ACT AFTER THAT WAS ANONYMOUS:
 *
 *   finance.customer_invoice.created            actor_id = 'u-e2e-finance'
 *   finance.customer_invoice.issued             actor_id = NULL
 *   finance.customer_invoice.receipt_recorded   actor_id = NULL
 *   finance.customer_invoice.cancelled          actor_id = NULL
 *
 * Not a bug in the event writer — the actor never reached the service. `issue(id)`, `cancel(id)`,
 * `recordReceipt(id, amount)` and `softDelete(tenantId, id)` took no actor, so the controller had
 * nobody to pass. Sending a claim to a customer, taking money against it and voiding a receivable
 * are the three most consequential things that happen to this record.
 *
 * And a SOFT-DELETE OF AN ISSUED INVOICE was accepted — 200 — so a document the customer had already
 * received vanished from every list with nobody named.
 *
 * THE WILDCARD HERE WAS ONE THIS PROGRAMME CREATED. Enumerating `finance.*` entity by entity removed
 * one wildcard and left sixteen; `finance.customer-invoice.*` re-granted issue, cancel, delete and
 * post to the same role that raises the invoice. A narrower wildcard is still a wildcard.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));

describe('customer invoicing — authority', () => {
  it('declares a permission on every act that changes what the customer owes', () => {
    const p = FinanceController.prototype;
    expect(declared(p.createCustomerInvoice)).toEqual(['finance.customer-invoice.create']);
    expect(declared(p.issueCustomerInvoice)).toEqual(['finance.customer-invoice.issue']);
    expect(declared(p.recordReceipt)).toEqual(['finance.customer-invoice.receipts']);
    expect(declared(p.cancelCustomerInvoice)).toEqual(['finance.customer-invoice.cancel']);
    expect(declared(p.softDeleteCustomerInvoice)).toEqual(['finance.customer-invoice.delete']);
    expect(declared(p.restoreCustomerInvoice)).toEqual(['finance.customer-invoice.restore']);
    expect(declared(p.bulkCustomerInvoices)).toEqual(['finance.customer-invoice.delete']);
  });

  it('separates sending an invoice from withdrawing one', () => {
    // AR RAISES AND SENDS. That is the job, and it stays with Finance.
    expect(holds('r-finance', 'finance.customer-invoice.create')).toBe(true);
    expect(holds('r-finance', 'finance.customer-invoice.issue')).toBe(true);
    expect(holds('r-finance', 'finance.customer-invoice.receipts')).toBe(true);

    // THE CORRECTIONS sit with the controller, which already owns the period close. Voiding a
    // receivable the customer has seen, and removing one from the register, are not day-to-day AR.
    for (const p of ['finance.customer-invoice.cancel', 'finance.customer-invoice.delete', 'finance.customer-invoice.restore']) {
      expect(holds('r-finance', p), `r-finance must not hold ${p}`).toBe(false);
      expect(holds('r-finance-controller', p), `the controller must hold ${p}`).toBe(true);
    }

    // …and the controller does not raise or send them, so neither role holds both halves.
    expect(holds('r-finance-controller', 'finance.customer-invoice.create')).toBe(false);
    expect(holds('r-finance-controller', 'finance.customer-invoice.issue')).toBe(false);
  });
});

describe('customer invoicing — the state machine', () => {
  const inv = (over: Partial<CustomerInvoice> = {}): CustomerInvoice => ({
    id: 'i-1', tenantId: 't-1', companyId: null, invoiceNumber: 'INV-1', accountId: null,
    customerName: 'Al Nahda Developments', projectId: null, projectName: null, contractRef: null,
    issueDate: '2026-09-18', dueDate: null, lines: [], subtotal: 100_000, vatTotal: 5_000, total: 105_000,
    currency: 'AED', exchangeRate: 1, baseTotal: 105_000,
    exchangeRateEffectiveDate: null, exchangeRateSource: null, exchangeRateId: null,
    amountPaid: 0, status: 'draft', deletedAt: null, createdAt: '2026-09-18T00:00:00.000Z',
    createdBy: 'u-ar', issuedBy: null, issuedAt: null,
    cancelledBy: null, cancelledAt: null, cancelReason: null, deletedBy: null, ...over,
  });
  const issued = (by = 'u-ar') => issueInvoice(inv(), by);

  it('records who sent it to the customer, and when', () => {
    const i = issued('u-ar');
    expect(i.status).toBe('issued');
    expect(i.issuedBy).toBe('u-ar');
    expect(i.issuedAt).not.toBeNull();
  });

  it('will not void a receivable silently', () => {
    expect(() => cancelInvoice(issued(), 'u-controller')).toThrow(/a reason is required/);
    expect(() => cancelInvoice(issued(), 'u-controller', '   ')).toThrow(/a reason is required/);
    // 400: the caller can fix this by supplying a reason, which is what separates it from the
    // refusals below.
    expect(classifyDomainMessage('a reason is required to cancel a customer invoice — the customer has seen this document').status).toBe(400);
  });

  it('refuses the person who issued it — 403, the actor is wrong and nothing else', () => {
    expect(() => cancelInvoice(issued('u-ar'), 'u-ar', 'raised in error')).toThrow(/may not cancel their own issue/);
    const voided = cancelInvoice(issued('u-ar'), 'u-controller', 'raised against the wrong contract');
    expect(voided).toMatchObject({ status: 'cancelled', cancelledBy: 'u-controller', cancelReason: 'raised against the wrong contract' });
    expect(cancellationSeparation(voided)).toBe('enforced');
    expect(classifyDomainMessage('the person who issued this invoice may not cancel their own issue — a second signature is what makes it a control'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('keeps the two refusals that were already right', () => {
    expect(() => cancelInvoice(inv({ status: 'paid' }), 'u-controller', 'why')).toThrow(/cannot cancel a fully paid invoice/);
    expect(() => cancelInvoice(inv({ status: 'partially_paid', amountPaid: 10_000 }), 'u-controller', 'why'))
      .toThrow(/receipts recorded/);
  });

  it('will not make a document the customer has seen disappear', () => {
    // 200 before this: `deleted_at` set on an ISSUED invoice, nobody named, gone from every list.
    expect(() => assertSoftDeletable(issued())).toThrow(/only a draft or cancelled customer invoice may be deleted/);
    expect(() => assertSoftDeletable(inv({ status: 'partially_paid' }))).toThrow(/may be deleted/);
    // A draft raised by mistake, and a voided one, may still go.
    expect(() => assertSoftDeletable(inv())).not.toThrow();
    expect(() => assertSoftDeletable(inv({ status: 'cancelled' }))).not.toThrow();
    // 409: the request is well formed and the remedy is a DIFFERENT act, not a corrected request.
    expect(classifyDomainMessage('only a draft or cancelled customer invoice may be deleted — this one is X, and an issued invoice is withdrawn by cancelling it, which records who and why'))
      .toEqual({ status: 409, code: 'CONFLICT' });
  });

  it('says unverifiable only where the invoice genuinely has no issuer', () => {
    // Issued before the column existed. The void proceeds rather than blocking work over a fact
    // nobody recorded at the time, and it says the check could not run.
    const legacy = { ...inv({ status: 'issued' }), issuedBy: null };
    expect(cancellationSeparation(cancelInvoice(legacy, 'u-anyone', 'correction'))).toBe('unverifiable');
    expect(cancellationSeparation(inv())).toBeNull(); // never cancelled — not a verdict at all
  });
});
