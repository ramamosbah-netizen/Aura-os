import { describe, it, expect } from 'vitest';
import * as domain from './purchase-order-line';
import {
  LINEAGE_IS_FIXED,
  linesCarryingAnEstimate,
  orderGoverningValue,
  makePurchaseOrderLine,
  mayEditOrderLines,
  nextOrderLineNo,
  orderedQuantityOf,
  orderTotal,
  provenanceOf,
  type PurchaseOrderLine,
  renumberOrderLines,
} from './purchase-order-line';

const snapshot = {
  materialCode: 'CAM-DOME-4MP',
  materialName: '4MP dome camera',
  specification: 'IP67, 2.8mm',
  manufacturer: 'Hikvision',
  model: 'DS-2CD2143G2-I',
  uom: 'nr',
};

const line = (over: Partial<Parameters<typeof makePurchaseOrderLine>[0]> = {}) =>
  makePurchaseOrderLine({
    tenantId: 't1',
    poId: 'po-1',
    lineNo: 1,
    materialId: 'mat-1',
    snapshot,
    quantity: 10,
    unitPrice: 450,
    unitPriceBasis: 'agreed',
    sourceType: 'direct',
    ...over,
  });

describe('an order line names a material and says how it was bought', () => {
  it('refuses a line with no canonical material', () => {
    expect(() => line({ materialId: '' })).toThrow(/must name a canonical material/);
  });

  it('refuses a quantity of nothing, and a negative price', () => {
    expect(() => line({ quantity: 0 })).toThrow(/greater than zero/);
    expect(() => line({ unitPrice: -1 })).toThrow(/zero or more/);
  });

  it('accepts a price of zero — a free issue is a real commercial fact', () => {
    expect(line({ unitPrice: 0 }).unitPrice).toBe(0);
  });

  it('takes the unit from the material snapshot', () => {
    expect(line({ snapshot: { ...snapshot, uom: 'm' } }).uom).toBe('m');
  });

  it('rounds the authored unit price to money', () => {
    expect(line({ unitPrice: 0.335 }).unitPrice).toBe(0.34);
  });
});

describe('a claim to have been sourced needs the chain behind it', () => {
  it('accepts a DIRECT line with no requisition at all — that is explicit lineage, not a gap', () => {
    const direct = line({ sourceType: 'direct' });
    expect(direct).toMatchObject({ sourceType: 'direct', sourcePrLineId: null, sourceQuoteLineId: null });
  });

  it('accepts a DIRECT line that happens to answer a requisition line', () => {
    // Orthogonal facts: HOW the supplier was arrived at, and WHAT demand this answers.
    expect(line({ sourceType: 'direct', sourcePrLineId: 'prl-1' }).sourcePrLineId).toBe('prl-1');
  });

  it('REFUSES a SOURCED line with no chain — the claim nobody may make by leaving a field empty', () => {
    expect(() => line({ sourceType: 'sourced' })).toThrow(/cannot claim it was competitively sourced/);
  });

  it('refuses a SOURCED line that cites the requisition but not the selected quote line', () => {
    expect(() => line({ sourceType: 'sourced', sourcePrLineId: 'prl-1' }))
      .toThrow(/the supplier quote line a buyer selected/);
  });

  it('accepts a SOURCED line carrying both halves of the chain', () => {
    const sourced = line({ sourceType: 'sourced', sourcePrLineId: 'prl-1', sourceQuoteLineId: 'ql-1' });
    expect(sourced).toMatchObject({ sourceType: 'sourced', sourcePrLineId: 'prl-1', sourceQuoteLineId: 'ql-1' });
  });

  it('refuses LEGACY outright — it is not a lineage anybody chooses', () => {
    expect(() => line({ sourceType: 'legacy' as never })).toThrow(/not a lineage anybody may choose/);
  });

  it('refuses an unrecognised source', () => {
    expect(() => line({ sourceType: 'guessed' as never })).toThrow(/must say how it was bought/);
  });
});

describe('what the order was arrived at, read from its lines', () => {
  it('calls an order with no lines LEGACY rather than direct', () => {
    // The distinction that matters: a historical order is not evidence that nobody sourced it.
    expect(provenanceOf([])).toBe('legacy');
  });

  it('reports direct and sourced when every line agrees', () => {
    expect(provenanceOf([line(), line({ lineNo: 2 })])).toBe('direct');
    const s = { sourceType: 'sourced' as const, sourcePrLineId: 'prl-1', sourceQuoteLineId: 'ql-1' };
    expect(provenanceOf([line(s), line({ lineNo: 2, ...s })])).toBe('sourced');
  });

  it('reports MIXED rather than collapsing to whichever line came first', () => {
    const sourced = line({ lineNo: 2, sourceType: 'sourced', sourcePrLineId: 'prl-1', sourceQuoteLineId: 'ql-1' });
    expect(provenanceOf([line(), sourced])).toBe('mixed');
  });
});

describe('the order total', () => {
  it('adds the lines up', () => {
    expect(orderTotal([line(), line({ lineNo: 2, quantity: 250, unitPrice: 4 })]))
      .toEqual({ lineCount: 2, value: 5500 });
  });

  it('rounds each extension before summing, not once at the end', () => {
    // Two lines of 0.333 × 1.00 each round to 0.33, so the order is 0.66 — the figure the printed
    // lines add up to. Summing raw and rounding once would print 0.67, which no line supports.
    const lines = [line({ quantity: 0.333, unitPrice: 1 }), line({ lineNo: 2, quantity: 0.333, unitPrice: 1 })];
    expect(orderTotal(lines).value).toBe(0.66);
  });

  it('has no unpriced state to carry — a line without a price cannot be created', () => {
    expect(() => line({ unitPrice: Number.NaN })).toThrow(/unit price of zero or more/);
  });
});

describe('the governing value', () => {
  it('reads the authored header for a LEGACY order with no lines', () => {
    expect(orderGoverningValue(7500, [])).toEqual({ value: 7500, derived: false });
  });

  it('derives from the lines once they exist, and the header stops speaking', () => {
    expect(orderGoverningValue(999_999, [line()])).toEqual({ value: 4500, derived: true });
  });
});

describe('lines are what the supplier was committed to', () => {
  it('lets a draft be edited', () => {
    expect(mayEditOrderLines('draft')).toEqual({ allowed: true });
  });

  it('refuses every later state, naming it', () => {
    for (const status of ['pending_approval', 'approved', 'issued', 'partially_received', 'received']) {
      const verdict = mayEditOrderLines(status);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toContain(status);
      expect(verdict.reason).toMatch(/only be changed while it is a draft/);
    }
  });
});

describe('ordered quantity per material — what a receipt is measured against', () => {
  it('sums every line of the same material', () => {
    const lines = [line(), line({ lineNo: 2, quantity: 5 }), line({ lineNo: 3, materialId: 'mat-2', quantity: 99 })];
    expect(orderedQuantityOf(lines, 'mat-1')).toBe(15);
  });

  it('answers zero for a material this order does not buy', () => {
    expect(orderedQuantityOf([line()], 'mat-absent')).toBe(0);
  });
});

describe('line numbering', () => {
  const l = (lineNo: number): PurchaseOrderLine => line({ lineNo });

  it('hands out the next free number', () => {
    expect(nextOrderLineNo([])).toBe(1);
    expect(nextOrderLineNo([l(1), l(4)])).toBe(5);
  });

  it('closes the gap left by a removal', () => {
    expect(renumberOrderLines([l(1), l(3), l(7)]).map((x) => x.lineNo)).toEqual([1, 2, 3]);
  });
});

describe('an estimate and an agreed price are not the same number', () => {
  it('requires a line to say which kind of figure it carries', () => {
    expect(() => line({ unitPriceBasis: undefined as never }))
      .toThrow(/must say what kind of price it carries/);
    expect(() => line({ unitPriceBasis: 'guessed' as never }))
      .toThrow(/must say what kind of price it carries/);
  });

  it('keeps a carried ESTIMATE distinguishable from an AGREED price at the same amount', () => {
    // Identical numbers, different commercial standing. Blending them is what lets a provisional
    // figure become a commitment the moment an order is issued.
    const provisional = line({ unitPrice: 450, unitPriceBasis: 'estimate' });
    const settled = line({ unitPrice: 450, unitPriceBasis: 'agreed' });
    expect(provisional.unitPrice).toBe(settled.unitPrice);
    expect(provisional.unitPriceBasis).not.toBe(settled.unitPriceBasis);
  });

  it('reports which lines still carry a placeholder, and does NOT count an unknown basis as one', () => {
    const estimate = line({ unitPriceBasis: 'estimate' });
    const agreed = line({ lineNo: 2, unitPriceBasis: 'agreed' });
    // A line written before the distinction existed is unknown, not provisional. Guessing would be
    // the inference this rule exists to prevent.
    const legacy: typeof agreed = { ...agreed, lineNo: 3, unitPriceBasis: null };
    expect(linesCarryingAnEstimate([estimate, agreed, legacy])).toEqual([estimate]);
  });
});

describe('a line’s lineage is fixed when it is created', () => {
  it('exposes no way to change it — the absence of a mutator IS the rule', () => {
    // A direct line must never become `sourced` because a requisition exists: a requisition is
    // demand, not sourcing. `sourced` becomes true only where a governed quotation selection made
    // it true, and that selection CREATES the line rather than relabelling one. If somebody ever
    // adds a setter for it, this fails and they have to come and read LINEAGE_IS_FIXED.
    const mutators = Object.keys(domain).filter(
      (k) => /^(set|change|mark|promote|convert)/.test(k) && /source|lineage/i.test(k),
    );
    expect(mutators).toEqual([]);
    expect(LINEAGE_IS_FIXED).toMatch(/only because a governed quotation selection made it so/);
  });

  it('carries the lineage through unchanged when a line is rebuilt from itself', () => {
    const direct = line({ sourceType: 'direct', sourcePrLineId: 'prl-1' });
    expect(direct.sourceType).toBe('direct');
    expect(direct.sourceQuoteLineId).toBeNull();
  });
});

/**
 * PO-01 — a line discount, and the question it forces.
 *
 * SUP-14 used to REFUSE to award an offer whose lines carried a discount. That was the right
 * fail-closed choice at the time: a purchase-order line had no discount field, so awarding meant
 * either losing the discount (ordering at more than was agreed) or folding it into the unit price
 * (restating the figure the supplier will invoice, and breaking the three-way match against their
 * own invoice line). Both state a price nobody agreed to.
 *
 * Refusing is not a fix, though, because the quotation model captures a discount and SUP-06 compares
 * it — so a perfectly valid offer could be recommended, approved, and then not awarded. The field
 * exists now, and with it the answer to the question it forces: what is a discounted line worth when
 * only part of it arrives? Pro rata. A discount is a reduction of the LINE, earned with the quantity
 * delivered — so every reading of that line agrees, which is the whole point.
 */
describe('a line discount', () => {
  const discounted = (over = {}) => line({ quantity: 10, unitPrice: 250, lineDiscount: 500, ...over });

  it('is kept beside the unit price, never folded into it', () => {
    const l = discounted();
    // The GROSS unit price survives, because that is what the supplier will invoice per unit.
    expect(l.unitPrice).toBe(250);
    expect(l.lineDiscount).toBe(500);
  });

  it('makes the line worth quantity x price LESS the discount', () => {
    expect(domain.lineNetValue(discounted())).toBe(2_000); // 10 x 250 - 500
    expect(domain.lineNetValue(line({ quantity: 10, unitPrice: 250 }))).toBe(2_500); // no discount
  });

  it('is earned pro rata, so a part delivery is valued at the effective unit price', () => {
    // 2,000 over 10 units = 200 a unit. Four delivered is 800 — not 1,000, which would credit the
    // supplier for a discount they have not yet earned.
    expect(domain.lineEffectiveUnitPrice(discounted())).toBe(200);
  });

  it('reaches the order total, so the header cannot disagree with the lines', () => {
    expect(orderTotal([discounted()]).value).toBe(2_000);
    expect(orderGoverningValue(9_999, [discounted()])).toEqual({ value: 2_000, derived: true });
  });

  it('refuses a discount larger than the line, and a negative one', () => {
    expect(() => discounted({ lineDiscount: 2_501 }))
      .toThrow(/cannot exceed what the line comes to/);
    expect(() => discounted({ lineDiscount: -1 }))
      .toThrow(/cannot be negative — a surcharge is not a discount/);
  });

  it('treats NULL as no discount rather than as zero-by-default', () => {
    expect(line({ quantity: 10, unitPrice: 250 }).lineDiscount).toBeNull();
  });
});

/**
 * A DISCOUNT SAYS WHICH KIND IT IS.
 *
 * Pro rata is what an UNCONDITIONAL LINE discount is worth when half the line arrives. It is not a
 * general truth about discounts, and the field invited it to be read as one. A header discount
 * belongs to the order and not to any line; a conditional rebate is earned on something not known at
 * receipt; an early-payment discount is earned by paying, not by receiving. Each needs its own
 * answer, so the kind is declared on the row rather than assumed by whoever reads it next.
 */
describe('which kind of discount', () => {
  it('defaults to the one kind AURA records, rather than leaving it unstated', () => {
    const l = line({ quantity: 10, unitPrice: 250, lineDiscount: 500 });
    expect(l.lineDiscountBasis).toBe('line_unconditional_prorata');
  });

  it('is NULL exactly when there is no discount', () => {
    expect(line({ quantity: 10, unitPrice: 250 }).lineDiscountBasis).toBeNull();
    expect(() => line({ quantity: 10, unitPrice: 250, lineDiscountBasis: 'line_unconditional_prorata' }))
      .toThrow(/discount kind was given with no discount/);
  });

  it('refuses a kind whose worth on a part delivery nobody has decided', () => {
    for (const kind of ['header_discount', 'conditional_rebate', 'early_payment']) {
      expect(() => line({ quantity: 10, unitPrice: 250, lineDiscount: 500, lineDiscountBasis: kind as never }),
        `${kind} must not be recordable as a pro-rata line discount`)
        .toThrow(/must say which kind it is/);
    }
  });

  it('refuses to value a unit when a discount does not say which kind it is', () => {
    // Only reachable by bypassing the factory — a row written before the kind existed, or a store
    // that forgot the column. It refuses rather than assuming the pro-rata rule applies.
    const smuggled = { ...line({ quantity: 10, unitPrice: 250, lineDiscount: 500 }), lineDiscountBasis: null } as PurchaseOrderLine;
    expect(() => domain.lineEffectiveUnitPrice(smuggled)).toThrow(/does not say which kind it is/);
    // The LINE total is still known: every kind of discount reduces what the whole line is worth.
    expect(domain.lineNetValue(smuggled)).toBe(2_000);
  });
});
