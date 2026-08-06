import { describe, it, expect } from 'vitest';
import { allocateOldestFirst, validateAllocations, type OpenInvoiceRef } from './receipt-allocation';

const open: OpenInvoiceRef[] = [
  { id: 'a', invoiceNumber: 'AR-1', issueDate: '2026-01-10', balance: 1000 },
  { id: 'b', invoiceNumber: 'AR-2', issueDate: '2026-02-10', balance: 500 },
  { id: 'c', invoiceNumber: 'AR-3', issueDate: '2026-03-10', balance: 800 },
];

describe('allocateOldestFirst', () => {
  it('fills the oldest invoice first, then the next', () => {
    const r = allocateOldestFirst(open, 1200);
    expect(r.allocations).toEqual([
      { invoiceId: 'a', invoiceNumber: 'AR-1', amount: 1000 },
      { invoiceId: 'b', invoiceNumber: 'AR-2', amount: 200 },
    ]);
    expect(r.totalAllocated).toBe(1200);
    expect(r.unapplied).toBe(0);
  });

  it('returns the over-payment as unapplied when the receipt exceeds all balances', () => {
    const r = allocateOldestFirst(open, 3000); // total open = 2,300
    expect(r.totalAllocated).toBe(2300);
    expect(r.unapplied).toBe(700);
    expect(r.allocations).toHaveLength(3);
  });

  it('partially fills a single invoice when the amount is small', () => {
    const r = allocateOldestFirst(open, 400);
    expect(r.allocations).toEqual([{ invoiceId: 'a', invoiceNumber: 'AR-1', amount: 400 }]);
    expect(r.unapplied).toBe(0);
  });

  it('rejects a non-positive amount', () => {
    expect(() => allocateOldestFirst(open, 0)).toThrow(/positive/);
  });
});

describe('validateAllocations', () => {
  it('accepts an explicit split within balances', () => {
    const r = validateAllocations(open, [{ invoiceId: 'a', amount: 600 }, { invoiceId: 'c', amount: 800 }], 1400);
    expect(r.totalAllocated).toBe(1400);
    expect(r.unapplied).toBe(0);
  });

  it('rejects allocating more than an invoice balance', () => {
    expect(() => validateAllocations(open, [{ invoiceId: 'b', amount: 900 }], 900)).toThrow(/exceeds the 500 balance/);
  });

  it('rejects allocations that exceed the amount received', () => {
    expect(() => validateAllocations(open, [{ invoiceId: 'a', amount: 1000 }], 500)).toThrow(/above the 500 received/);
  });

  it('rejects an unknown invoice', () => {
    expect(() => validateAllocations(open, [{ invoiceId: 'z', amount: 100 }], 100)).toThrow(/not an open invoice/);
  });
});
