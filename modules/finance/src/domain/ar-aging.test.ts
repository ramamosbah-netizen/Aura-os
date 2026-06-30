import { describe, it, expect } from 'vitest';
import { bucketFor, buildArAging } from './ar-aging';
import type { CustomerInvoice } from './customer-invoice';

function inv(over: Partial<CustomerInvoice>): CustomerInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: 't1',
    companyId: null,
    invoiceNumber: 'INV',
    customerName: 'Acme',
    projectId: null,
    projectName: null,
    contractRef: null,
    issueDate: '2026-01-01',
    dueDate: null,
    lines: [],
    subtotal: 0,
    vatTotal: 0,
    total: 1000,
    currency: 'AED',
    exchangeRate: 1,
    baseTotal: 1000,
    amountPaid: 0,
    status: 'issued',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    ...over,
  };
}

describe('bucketFor', () => {
  it('maps day counts to buckets', () => {
    expect(bucketFor(0)).toBe('current');
    expect(bucketFor(-5)).toBe('current');
    expect(bucketFor(1)).toBe('d1_30');
    expect(bucketFor(30)).toBe('d1_30');
    expect(bucketFor(45)).toBe('d31_60');
    expect(bucketFor(75)).toBe('d61_90');
    expect(bucketFor(120)).toBe('d90_plus');
  });
});

describe('buildArAging', () => {
  it('buckets by due date and nets receipts', () => {
    const r = buildArAging(
      [
        inv({ customerName: 'Acme', dueDate: '2026-06-30', total: 1000, amountPaid: 0 }), // asOf 2026-07-10 → 10 days → 1-30
        inv({ customerName: 'Acme', dueDate: '2026-04-01', total: 2000, amountPaid: 500 }), // 100 days → 90+, outstanding 1500
        inv({ customerName: 'Beta', dueDate: '2026-07-20', total: 800, amountPaid: 0 }), // not yet due → current
      ],
      '2026-07-10',
    );
    const acme = r.byCustomer.find((c) => c.customerName === 'Acme')!;
    expect(acme.buckets.d1_30).toBe(1000);
    expect(acme.buckets.d90_plus).toBe(1500);
    expect(acme.total).toBe(2500);
    const beta = r.byCustomer.find((c) => c.customerName === 'Beta')!;
    expect(beta.buckets.current).toBe(800);
    expect(r.totals.d1_30).toBe(1000);
    expect(r.totals.d90_plus).toBe(1500);
    expect(r.totals.current).toBe(800);
    expect(r.grandTotal).toBe(3300);
  });

  it('excludes draft, paid, and cancelled invoices', () => {
    const r = buildArAging(
      [
        inv({ status: 'draft', total: 1000 }),
        inv({ status: 'paid', total: 1000, amountPaid: 1000 }),
        inv({ status: 'cancelled', total: 1000 }),
      ],
      '2026-07-10',
    );
    expect(r.grandTotal).toBe(0);
    expect(r.byCustomer).toHaveLength(0);
  });

  it('falls back to issue date when no due date', () => {
    const r = buildArAging([inv({ issueDate: '2026-01-01', dueDate: null, total: 500 })], '2026-07-10'); // ~190 days
    expect(r.totals.d90_plus).toBe(500);
  });

  it('sorts customers by descending total', () => {
    const r = buildArAging(
      [inv({ customerName: 'Small', total: 100 }), inv({ customerName: 'Big', total: 9000 })],
      '2026-07-10',
    );
    expect(r.byCustomer[0].customerName).toBe('Big');
  });
});
