import { describe, it, expect } from 'vitest';
import {
  makeQuotationLine,
  lineAmountInQuotedCurrency,
  requirementCoverage,
  isSupplierClaimOnly,
  type QuotationLine,
} from './quotation-line';

/**
 * The supplier quotation spine — what a supplier offers, item by item.
 *
 * The rule under test throughout: a quotation line is a DECLARATION, never a DETERMINATION.
 */

const line = (over: Partial<Parameters<typeof makeQuotationLine>[0]> = {}): QuotationLine =>
  makeQuotationLine({
    tenantId: 't-1', quotationId: 'q-1', prLineId: 'prl-1',
    quantity: 10, unitPrice: 50, uom: 'nr',
    ...over,
  });

describe('a quotation line answers a requisition line', () => {
  it('requires the requirement it answers', () => {
    expect(() => makeQuotationLine({ tenantId: 't-1', quotationId: 'q-1', prLineId: '', quantity: 1, unitPrice: 1 }))
      .toThrow(/must answer a requisition line/);
  });

  it('keeps the supplier and RFQ off the line — they are reached through the quotation', () => {
    const l = line();
    expect(l.quotationId).toBe('q-1');
    expect(l).not.toHaveProperty('supplierId');
    expect(l).not.toHaveProperty('rfqId');
  });
});

describe('a quoted line is actually an offer', () => {
  it('requires a quantity and a unit price', () => {
    expect(() => line({ unitPrice: null })).toThrow(/requires a quantity and a unit price/);
    expect(() => line({ quantity: null })).toThrow(/requires a quantity and a unit price/);
    expect(() => line({ quantity: 0 })).toThrow(/requires a quantity and a unit price/);
  });

  it('points the supplier at no_bid rather than accepting an unpriced "offer"', () => {
    expect(() => line({ unitPrice: null })).toThrow(/records no_bid instead/);
  });
});

describe('silence and refusal are different facts', () => {
  it('records a declined line as an answer', () => {
    const declined = line({ response: 'no_bid', quantity: null, unitPrice: null });
    expect(declined.response).toBe('no_bid');
    expect(declined.unitPrice).toBeNull();
  });

  it('refuses a declined line that carries a price', () => {
    expect(() => line({ response: 'no_bid', unitPrice: 50, quantity: null }))
      .toThrow(/declined line cannot carry a price/);
  });

  it('separates quoted, declined and UNANSWERED when reporting coverage', () => {
    // Five things were asked for. One quoted, one declined, three never answered — and an
    // unanswered requirement is an absence, never counted as a refusal.
    const lines = [line({ prLineId: 'a' }), line({ prLineId: 'b', response: 'no_bid', quantity: null, unitPrice: null })];
    expect(requirementCoverage(['a', 'b', 'c', 'd', 'e'], lines))
      .toEqual({ requirements: 5, quoted: 1, declined: 1, unanswered: 3 });
  });

  it('treats a partial bidder as legitimate rather than incomplete', () => {
    const coverage = requirementCoverage(['a', 'b'], [line({ prLineId: 'a' })]);
    expect(coverage.quoted).toBe(1);
    expect(coverage.unanswered).toBe(1);
    expect(coverage.declined).toBe(0);
  });
});

describe('an alternate is a different thing, not an equivalent', () => {
  it('requires the make and model actually being offered', () => {
    // RETIRED (migration 0351). An alternative is a property of the OFFER, not of a line: a
    // supplier offering a Bosch equivalent beside a Hikvision one is making two offers, and a line
    // is unique per requisition line per revision, so the second variant had nowhere to go.
    // `makeQuotationOffer` now carries the requirement that an alternative say what it offers
    // instead — see quotation-family.test.ts.
    //
    // What the LINE still holds is the supplier's compliance CLAIM, and nothing more.
    const claimed = line({ offeredManufacturer: 'Acme', offeredModel: 'X-9', complianceResponse: 'comply' });
    expect(claimed.complianceResponse).toBe('comply');
    expect(claimed).not.toHaveProperty('isCompliant');
    expect(claimed).not.toHaveProperty('eligible');
  });
});

describe('the line carries no verdict, and that is the design', () => {
  it('has no compliance verdict, eligibility, rank or comparable value', () => {
    const l = line({ complianceResponse: 'comply' });
    for (const forbidden of ['isCompliant', 'eligible', 'technicallyApproved', 'rank', 'normalisedTotal', 'landedCost']) {
      expect(l, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it('answers "is this compliant?" with the only honest answer available here', () => {
    // A supplier saying `comply` is a claim with exactly the standing of their price. Eligibility
    // belongs to the technical evaluation authority (SUP-01, Procurement RFQ context). Quality's MAR
    // is a separate authority that this path does not read at all.
    expect(isSupplierClaimOnly(line({ complianceResponse: 'comply' }))).toBe(true);
  });
});

describe('the supplier’s own arithmetic, in the supplier’s own currency', () => {
  it('derives the line amount rather than storing it', () => {
    expect(lineAmountInQuotedCurrency(line({ quantity: 10, unitPrice: 50 }))).toBe(500);
    const l = line();
    expect(l).not.toHaveProperty('amount');
    expect(l).not.toHaveProperty('lineTotal');
  });

  it('applies a line discount the supplier gave', () => {
    expect(lineAmountInQuotedCurrency(line({ quantity: 10, unitPrice: 50, lineDiscount: 75 }))).toBe(425);
  });

  it('reads nothing for a declined line', () => {
    expect(lineAmountInQuotedCurrency(line({ response: 'no_bid', quantity: null, unitPrice: null }))).toBeNull();
  });
});
