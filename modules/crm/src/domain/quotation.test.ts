import { describe, it, expect } from 'vitest';
import { applyQuotationAction, reviseQuotation, makeQuotation, computeQuotationTotals, buildQuotationLine, sendQuotation, acceptQuotation, rejectQuotation, expireQuotation } from './quotation';

const T = 'tenant-1';
const lines = [
  { description: 'Access control system', quantity: 4, unitPrice: 2500 }, // net 10000 vat 500
  { description: 'Commissioning', quantity: 1, unitPrice: 1500 }, // net 1500 vat 75
];
const base = { tenantId: T, quoteNumber: 'QT-001', customerName: 'Acme LLC', issueDate: '2026-06-29', lines };

describe('computeQuotationTotals (5% VAT)', () => {
  it('sums net, vat, gross', () => {
    const t = computeQuotationTotals(lines.map(buildQuotationLine));
    expect(t.subtotal).toBe(11500);
    expect(t.vatTotal).toBe(575);
    expect(t.total).toBe(12075);
  });
});

describe('makeQuotation', () => {
  it('creates a draft with totals', () => {
    const q = makeQuotation(base);
    expect(q.status).toBe('draft');
    expect(q.total).toBe(12075);
  });
  it('requires at least one line', () => {
    expect(() => makeQuotation({ ...base, lines: [] })).toThrow('at least one line');
  });
  it('rejects a bad issue date', () => {
    expect(() => makeQuotation({ ...base, issueDate: '29/06/2026' })).toThrow('YYYY-MM-DD');
  });
  it('rejects a non-positive line qty', () => {
    expect(() => makeQuotation({ ...base, lines: [{ description: 'x', quantity: 0, unitPrice: 1 }] })).toThrow('quantity must be positive');
  });
});

describe('lifecycle', () => {
  it('draft → sent → accepted', () => {
    let q = sendQuotation(makeQuotation(base));
    expect(q.status).toBe('sent');
    q = acceptQuotation(q);
    expect(q.status).toBe('accepted');
  });
  it('can reject a sent quote', () => {
    expect(rejectQuotation(sendQuotation(makeQuotation(base))).status).toBe('rejected');
  });
  it('cannot accept a draft (must send first)', () => {
    expect(() => acceptQuotation(makeQuotation(base))).toThrow('cannot accept from status draft');
  });
  it('can expire a draft or sent quote', () => {
    expect(expireQuotation(makeQuotation(base)).status).toBe('expired');
    expect(expireQuotation(sendQuotation(makeQuotation(base))).status).toBe('expired');
  });
  it('cannot expire an accepted quote', () => {
    expect(() => expireQuotation(acceptQuotation(sendQuotation(makeQuotation(base))))).toThrow('cannot expire');
  });
});


describe('extended lifecycle (review/negotiation/revisions)', () => {
  it('walks draft -> internal_review -> approved -> sent -> under_negotiation -> accepted', () => {
    let q = makeQuotation(base);
    q = applyQuotationAction(q, 'submit_review');
    expect(q.status).toBe('internal_review');
    q = applyQuotationAction(q, 'approve');
    expect(q.status).toBe('approved');
    q = applyQuotationAction(q, 'send');
    q = applyQuotationAction(q, 'negotiate');
    expect(q.status).toBe('under_negotiation');
    expect(applyQuotationAction(q, 'accept').status).toBe('accepted');
  });

  it('cancel works from any open status but not after acceptance', () => {
    expect(applyQuotationAction(makeQuotation(base), 'cancel').status).toBe('cancelled');
    const accepted = applyQuotationAction(applyQuotationAction(makeQuotation(base), 'send'), 'accept');
    expect(() => applyQuotationAction(accepted, 'cancel')).toThrow('cannot cancel from status accepted');
  });

  it('revise supersedes the sent quote and drafts Rev n+1 with the same number and lines', () => {
    const sent = applyQuotationAction(makeQuotation(base), 'send');
    const { superseded, next } = reviseQuotation(sent);
    expect(superseded.status).toBe('revised');
    expect(next.status).toBe('draft');
    expect(next.revision).toBe(1);
    expect(next.parentQuotationId).toBe(sent.id);
    expect(next.quoteNumber).toBe(sent.quoteNumber);
    expect(next.lines).toHaveLength(sent.lines.length);
    expect(next.total).toBe(sent.total);
    expect(() => reviseQuotation(makeQuotation(base))).toThrow('cannot revise from status draft');
  });
});
