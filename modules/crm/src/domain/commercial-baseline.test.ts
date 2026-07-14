import { describe, it, expect } from 'vitest';
import { makeQuotation, applyQuotationAction } from './quotation';
import { makeCommercialBaseline, commercialVariance } from './commercial-baseline';

const q = () => applyQuotationAction(makeQuotation({
  tenantId: 't1', quoteNumber: 'QT-9', customerName: 'Emaar', accountId: 'a1',
  sourceOpportunityId: 'o1', issueDate: '2026-07-14',
  lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], // net 2000, vat 100, total 2100
}), 'approve');

describe('makeCommercialBaseline', () => {
  it('snapshots the approved quotation lines + totals + provenance', () => {
    const b = makeCommercialBaseline(q(), 'u-approver');
    expect(b.quotationId).toBeDefined();
    expect(b.total).toBe(2100);
    expect(b.subtotal).toBe(2000);
    expect(b.lines).toHaveLength(1);
    expect(b.accountId).toBe('a1');
    expect(b.sourceOpportunityId).toBe('o1');
    expect(b.lockedBy).toBe('u-approver');
    expect(b.lockedAt).toBeTruthy();
  });

  it('is a by-value snapshot — mutating the quotation lines afterwards does not change the baseline', () => {
    const quote = q();
    const b = makeCommercialBaseline(quote, null);
    quote.lines[0].unitPrice = 99999;
    quote.lines[0].lineNet = 99999;
    expect(b.lines[0].unitPrice).toBe(1000); // frozen
  });
});

describe('commercialVariance', () => {
  it('reports no drift when the contract equals the approved price', () => {
    const v = commercialVariance(2100, 2100);
    expect(v.variance).toBe(0);
    expect(v.variancePct).toBe(0);
    expect(v.drifted).toBe(false);
  });
  it('reports positive drift when the contract exceeds the approved price', () => {
    const v = commercialVariance(2000, 2200);
    expect(v.variance).toBe(200);
    expect(v.variancePct).toBe(10);
    expect(v.drifted).toBe(true);
  });
  it('reports negative drift when the contract is below the approved price', () => {
    const v = commercialVariance(2000, 1800);
    expect(v.variance).toBe(-200);
    expect(v.drifted).toBe(true);
  });
  it('handles a zero baseline without dividing by zero', () => {
    expect(commercialVariance(0, 500).variancePct).toBe(0);
  });
});
