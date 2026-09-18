import { describe, it, expect } from 'vitest';
import { describeOutstanding, receiptOf, receiptStatus } from './order-receipt';
import { makePurchaseOrderLine, type PurchaseOrderLine } from './purchase-order-line';

const line = (over: Partial<Parameters<typeof makePurchaseOrderLine>[0]> & { id?: string } = {}): PurchaseOrderLine => {
  const { id, ...input } = over;
  const made = makePurchaseOrderLine({
    tenantId: 't1', poId: 'po-1', lineNo: 1, materialId: 'mat-1',
    snapshot: {
      materialCode: 'CAM-DOME-4MP', materialName: '4MP dome camera',
      specification: null, manufacturer: null, model: null, uom: 'nr',
    },
    quantity: 100, unitPrice: 10, unitPriceBasis: 'agreed', sourceType: 'direct',
    ...input,
  });
  return id ? { ...made, id } : made;
};

describe('BUY-05 — receive 1 of 100, and 99 are still outstanding', () => {
  it('is the exact case the register records as broken', () => {
    const l = line({ id: 'l1', quantity: 100, unitPrice: 10 });
    const receipt = receiptOf([l], { l1: 1 });

    expect(receipt.lines[0]).toMatchObject({ ordered: 100, accepted: 1, outstanding: 99, settled: false });
    // Not received. That single fact is the whole defect.
    expect(receipt.fullyReceived).toBe(false);
    expect(receiptStatus(receipt)).toBe('partially_received');
    // …and the exposure is the 99 still owed, at the price they were ordered at.
    expect(receipt.outstandingValue).toBe(990);
  });

  it('says so in words a person chasing the delivery can act on', () => {
    const receipt = receiptOf([line({ id: 'l1', quantity: 100 })], { l1: 1 });
    expect(describeOutstanding(receipt))
      .toBe('line 1 (CAM-DOME-4MP): 1 of 100 nr received, 99 outstanding');
  });

  it('completes only when the last of it arrives', () => {
    const l = line({ id: 'l1', quantity: 100 });
    expect(receiptStatus(receiptOf([l], { l1: 99 }))).toBe('partially_received');
    const done = receiptOf([l], { l1: 100 });
    expect(done.fullyReceived).toBe(true);
    expect(done.outstandingValue).toBe(0);
    expect(receiptStatus(done)).toBe('received');
    expect(describeOutstanding(done)).toBe('everything ordered has been received');
  });
});

describe('an order is a set of positions, not a percentage', () => {
  const cameras = line({ id: 'l1', lineNo: 1, quantity: 12, unitPrice: 450 });
  const cable = line({
    id: 'l2', lineNo: 2, quantity: 250, unitPrice: 4, materialId: 'mat-2',
    snapshot: { materialCode: 'CBL-CAT6', materialName: 'Cat6 cable', specification: null, manufacturer: null, model: null, uom: 'm' },
  });

  it('will not call an order received while ANY line is still owed', () => {
    // Every camera has arrived and not one metre of cable. An order-level percentage would read
    // "most of it"; the truth is that the cable is entirely outstanding.
    const receipt = receiptOf([cameras, cable], { l1: 12 });
    expect(receipt.fullyReceived).toBe(false);
    expect(receipt.outstanding.map((l) => l.materialCode)).toEqual(['CBL-CAT6']);
    expect(receipt.outstandingValue).toBe(1000);
    expect(receiptStatus(receipt)).toBe('partially_received');
  });

  it('names every outstanding line, so a chase knows what to ask for', () => {
    const receipt = receiptOf([cameras, cable], { l1: 5, l2: 100 });
    expect(describeOutstanding(receipt)).toBe(
      'line 1 (CAM-DOME-4MP): 5 of 12 nr received, 7 outstanding; ' +
      'line 2 (CBL-CAT6): 100 of 250 m received, 150 outstanding',
    );
  });

  it('is received only when every position is settled', () => {
    expect(receiptOf([cameras, cable], { l1: 12, l2: 250 }).fullyReceived).toBe(true);
  });
});

describe('accepted is not the same as delivered', () => {
  it('does not count a rejected quantity as progress against the order', () => {
    // Ten arrived, all ten were rejected. The material is still owed; a delivery that was sent back
    // is a fact about the delivery, not progress on the order.
    const receipt = receiptOf([line({ id: 'l1', quantity: 100 })], { l1: 0 }, { l1: 10 });
    expect(receipt.lines[0]).toMatchObject({ accepted: 0, rejected: 10, outstanding: 100, settled: false });
    expect(receipt.anyReceived).toBe(false);
    expect(receiptStatus(receipt)).toBeNull();
  });

  it('counts only what was accepted when a delivery was part-rejected', () => {
    const receipt = receiptOf([line({ id: 'l1', quantity: 100 })], { l1: 40 }, { l1: 10 });
    expect(receipt.lines[0]).toMatchObject({ accepted: 40, rejected: 10, outstanding: 60 });
  });
});

describe('what cannot be concluded', () => {
  it('returns NOTHING for an order with no lines, and says why', () => {
    // A legacy order has no positions to measure. That is unanswerable, not empty — and returning
    // a status here is how an order gets closed by an absence.
    const receipt = receiptOf([], {});
    expect(receipt.determinable).toBe(false);
    expect(receipt.fullyReceived).toBe(false);
    expect(receiptStatus(receipt)).toBeNull();
    expect(describeOutstanding(receipt)).toMatch(/cannot be measured/);
  });

  it('leaves an order alone when nothing has been accepted yet', () => {
    expect(receiptStatus(receiptOf([line({ id: 'l1' })], {}))).toBeNull();
  });

  it('treats an unknown line id as nothing received, never as everything', () => {
    const receipt = receiptOf([line({ id: 'l1', quantity: 100 })], { 'some-other-line': 100 });
    expect(receipt.lines[0]).toMatchObject({ accepted: 0, outstanding: 100 });
    expect(receiptStatus(receipt)).toBeNull();
  });
});

describe('over-delivery is recorded, not refused', () => {
  it('settles the line, flags it, and never reports a negative debt', () => {
    const receipt = receiptOf([line({ id: 'l1', quantity: 100, unitPrice: 10 })], { l1: 120 });
    expect(receipt.lines[0]).toMatchObject({
      accepted: 120, outstanding: 0, outstandingValue: 0, settled: true, overReceived: true,
    });
    expect(receipt.fullyReceived).toBe(true);
  });
});

describe('exposure', () => {
  it('is the money still owed, at the price it was ordered at', () => {
    const a = line({ id: 'l1', lineNo: 1, quantity: 10, unitPrice: 450 });
    const b = line({ id: 'l2', lineNo: 2, quantity: 250, unitPrice: 4 });
    // 5 cameras owed at 450 = 2,250; 150 metres owed at 4 = 600.
    expect(receiptOf([a, b], { l1: 5, l2: 100 }).outstandingValue).toBe(2850);
  });

  it('carries how each line was bought, so exposure reads by lineage as well as by supplier', () => {
    const receipt = receiptOf([line({ id: 'l1' })], {});
    expect(receipt.lines[0].sourceType).toBe('direct');
  });
});

/**
 * PO-01 — what a DISCOUNTED line is worth when only part of it arrives.
 *
 * The receipt position is where this question becomes money. A discount is a reduction of the LINE,
 * so it is earned with the quantity delivered: value what has arrived at the gross unit price and
 * the outstanding figure overstates what is still owed, by exactly the discount that has not been
 * earned yet. The numbers would only come right if the very last unit turned up.
 */
describe('a line discount, at the point of delivery', () => {
  it('values what is still outstanding at the effective unit price, not the list price', () => {
    // 10 at 250 less a 500 discount: 2,000 for the line, 200 a unit. Four arrive, six outstanding.
    const l = line({ id: 'l1', quantity: 10, unitPrice: 250, lineDiscount: 500, lineDiscountBasis: 'line_unconditional_prorata' });
    const receipt = receiptOf([l], { l1: 4 });

    expect(receipt.lines[0].outstanding).toBe(6);
    expect(receipt.lines[0].outstandingValue).toBe(1_200);   // 6 x 200
    expect(receipt.lines[0].outstandingValue).not.toBe(1_500); // 6 x 250, the list price
  });

  it('closes at zero when the whole line arrives, discount and all', () => {
    const l = line({ id: 'l1', quantity: 10, unitPrice: 250, lineDiscount: 500, lineDiscountBasis: 'line_unconditional_prorata' });
    const receipt = receiptOf([l], { l1: 10 });
    expect(receipt.lines[0].outstandingValue).toBe(0);
    expect(receipt.fullyReceived).toBe(true);
  });
});
