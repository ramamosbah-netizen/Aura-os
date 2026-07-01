import { describe, it, expect } from 'vitest';
import { computeFxRevaluation, type RevalInvoice } from './fx-revaluation';

const inv = (o: Partial<RevalInvoice>): RevalInvoice => ({ invoiceNumber: 'X', currency: 'USD', exchangeRate: 3.6, total: 1000, amountPaid: 0, status: 'issued', ...o });

describe('fx-revaluation', () => {
  it('revalues open foreign AR at current rate; gain = base@current − base@booked', () => {
    const r = computeFxRevaluation([inv({ currency: 'USD', exchangeRate: 3.6, total: 1000 })], () => 3.75, '2026-06-30');
    expect(r.lines[0].baseAtBooked).toBe(3600);
    expect(r.lines[0].baseAtCurrent).toBe(3750);
    expect(r.lines[0].gainLoss).toBe(150);
    expect(r.totalGainLoss).toBe(150);
  });

  it('excludes base currency, paid, and closed invoices', () => {
    const r = computeFxRevaluation([
      inv({ currency: 'AED', exchangeRate: 1 }),                 // base
      inv({ currency: 'USD', total: 1000, amountPaid: 1000 }),   // fully paid → outstanding 0
      inv({ currency: 'USD', status: 'paid' }),                  // closed
      inv({ currency: 'EUR', exchangeRate: 3.9, total: 500, status: 'partially_paid', amountPaid: 100 }), // open 400
    ], (c) => (c === 'EUR' ? 4.0 : 3.75), '2026-06-30');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].outstanding).toBe(400);
    expect(r.lines[0].gainLoss).toBe(40); // 400×(4.0−3.9)
  });
});
