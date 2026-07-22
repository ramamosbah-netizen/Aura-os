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

// R3 governance: a quotation must be APPROVED before it can be sent to a customer.
const approve = (q: ReturnType<typeof makeQuotation>) => applyQuotationAction(q, 'approve');
const toSent = () => sendQuotation(approve(makeQuotation(base)));

describe('lifecycle', () => {
  it('draft → approve → sent → accepted', () => {
    let q = toSent();
    expect(q.status).toBe('sent');
    q = acceptQuotation(q);
    expect(q.status).toBe('accepted');
  });
  it('can reject a sent quote', () => {
    expect(rejectQuotation(toSent()).status).toBe('rejected');
  });
  it('cannot accept a draft (must send first)', () => {
    expect(() => acceptQuotation(makeQuotation(base))).toThrow('cannot accept from status draft');
  });
  it('can expire a draft or sent quote', () => {
    expect(expireQuotation(makeQuotation(base)).status).toBe('expired');
    expect(expireQuotation(toSent()).status).toBe('expired');
  });
  it('cannot expire an accepted quote', () => {
    expect(() => expireQuotation(acceptQuotation(toSent()))).toThrow('cannot expire');
  });
});

describe('commercial governance (R3): cannot send unapproved', () => {
  it('cannot send straight from draft — approval is required', () => {
    expect(() => sendQuotation(makeQuotation(base))).toThrow('cannot send from status draft');
  });
  it('approve is allowed directly from draft (one-step authorized sign-off)', () => {
    expect(approve(makeQuotation(base)).status).toBe('approved');
  });
  it('send is allowed once approved', () => {
    expect(sendQuotation(approve(makeQuotation(base))).status).toBe('sent');
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
    const accepted = applyQuotationAction(toSent(), 'accept');
    expect(() => applyQuotationAction(accepted, 'cancel')).toThrow('cannot cancel from status accepted');
  });

  it('revise supersedes the sent quote and drafts Rev n+1 with the same number and lines', () => {
    const sent = toSent();
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

describe('structured commercial terms', () => {
  it('normalises exclusions — trims, drops blanks, dedupes case-insensitively keeping first spelling', () => {
    const q = makeQuotation({ ...base, exclusions: [' VAT ', 'vat', '', 'Permits', 'permits', 'Civil works'] });
    expect(q.exclusions).toEqual(['VAT', 'Permits', 'Civil works']);
  });

  it('defaults to an empty exclusion list and null payment/delivery, never undefined', () => {
    const q = makeQuotation(base);
    expect(q.exclusions).toEqual([]);
    expect(q.paymentConditions).toBeNull();
    expect(q.deliveryTerms).toBeNull();
  });

  it('trims payment and delivery, blanks become null', () => {
    const q = makeQuotation({ ...base, paymentConditions: '  50% advance ', deliveryTerms: '   ' });
    expect(q.paymentConditions).toBe('50% advance');
    expect(q.deliveryTerms).toBeNull();
  });

  it('carries the commercial position into a revision — a new price does not reset what was excluded', () => {
    const sent = sendQuotation(applyQuotationAction(
      makeQuotation({ ...base, exclusions: ['VAT', 'Permits'], paymentConditions: '50/50', deliveryTerms: '6 weeks' }),
      'approve',
    ));
    const { next } = reviseQuotation(sent);
    expect(next.exclusions).toEqual(['VAT', 'Permits']);
    expect(next.paymentConditions).toBe('50/50');
    expect(next.deliveryTerms).toBe('6 weeks');
  });
});
