import { describe, it, expect } from 'vitest';
import { makeCustomerInvoice, computeTotals, buildLine, issueInvoice, recordReceipt, cancelInvoice, balanceOf } from './customer-invoice';

const T = 'tenant-1';
const baseLines = [
  { description: 'Supply & install CCTV', quantity: 10, unitPrice: 1000 }, // net 10000, vat 500
  { description: 'Cabling', quantity: 1, unitPrice: 2000 }, // net 2000, vat 100
];
const base = { tenantId: T, invoiceNumber: 'INV-001', customerName: 'Acme LLC', issueDate: '2026-06-20', lines: baseLines };

describe('computeTotals (UAE 5% VAT)', () => {
  it('sums net, vat, and gross across lines', () => {
    const lines = baseLines.map(buildLine);
    const t = computeTotals(lines);
    expect(t.subtotal).toBe(12000);
    expect(t.vatTotal).toBe(600);
    expect(t.total).toBe(12600);
  });

  it('rounds to 2 decimals', () => {
    const t = computeTotals([buildLine({ description: 'x', quantity: 3, unitPrice: 33.33 })]); // net 99.99, vat 5.00
    expect(t.subtotal).toBe(99.99);
    expect(t.vatTotal).toBe(5);
    expect(t.total).toBe(104.99);
  });
});

describe('makeCustomerInvoice', () => {
  it('creates a draft with computed totals', () => {
    const inv = makeCustomerInvoice(base);
    expect(inv.status).toBe('draft');
    expect(inv.total).toBe(12600);
    expect(inv.amountPaid).toBe(0);
  });

  it('requires at least one line', () => {
    expect(() => makeCustomerInvoice({ ...base, lines: [] })).toThrow('at least one line');
  });

  it('rejects a bad issue date', () => {
    expect(() => makeCustomerInvoice({ ...base, issueDate: '2026/06/20' })).toThrow('YYYY-MM-DD');
  });

  it('rejects a non-positive line quantity', () => {
    expect(() => makeCustomerInvoice({ ...base, lines: [{ description: 'x', quantity: 0, unitPrice: 1 }] })).toThrow('quantity must be positive');
  });
});

describe('lifecycle', () => {
  it('issues then takes a partial then final receipt', () => {
    let inv = issueInvoice(makeCustomerInvoice(base));
    expect(inv.status).toBe('issued');
    inv = recordReceipt(inv, 6000);
    expect(inv.status).toBe('partially_paid');
    expect(balanceOf(inv)).toBe(6600);
    inv = recordReceipt(inv, 6600);
    expect(inv.status).toBe('paid');
    expect(balanceOf(inv)).toBe(0);
  });

  it('rejects receipts before issue', () => {
    expect(() => recordReceipt(makeCustomerInvoice(base), 100)).toThrow('cannot record a receipt');
  });

  it('rejects an overpayment', () => {
    const inv = issueInvoice(makeCustomerInvoice(base));
    expect(() => recordReceipt(inv, 99999)).toThrow('exceeds invoice balance');
  });

  it('cannot cancel once a receipt is recorded', () => {
    const inv = recordReceipt(issueInvoice(makeCustomerInvoice(base)), 100);
    expect(() => cancelInvoice(inv)).toThrow('receipts recorded');
  });

  it('can cancel a draft', () => {
    expect(cancelInvoice(makeCustomerInvoice(base)).status).toBe('cancelled');
  });
});
