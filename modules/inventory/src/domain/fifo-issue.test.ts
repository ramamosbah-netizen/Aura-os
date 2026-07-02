import { describe, expect, it } from 'vitest';
import { fifoIssueCost, fifoReceiptState, type FifoMove } from './fifo';

describe('FIFO issue costing (COGS)', () => {
  it('consumes oldest layers first — classic FIFO COGS', () => {
    // Receive 10 @ 5, then 10 @ 8; issue 15 → 10@5 + 5@8 = 50 + 40 = 90 COGS.
    const prior: FifoMove[] = [
      { direction: 'in', quantity: 10, unitCost: 5 },
      { direction: 'in', quantity: 10, unitCost: 8 },
    ];
    const f = fifoIssueCost(prior, 15);
    expect(f.cogs).toBe(90);
    expect(f.unitCost).toBe(6); // 90 / 15
    expect(f.remainingQty).toBe(5);
    expect(f.remainingValue).toBe(40); // 5 @ 8
    expect(f.avgCost).toBe(8);
  });

  it('differs from WAC (proves FIFO, not average)', () => {
    const prior: FifoMove[] = [
      { direction: 'in', quantity: 10, unitCost: 5 },
      { direction: 'in', quantity: 10, unitCost: 15 },
    ];
    // WAC would cost the issue of 10 at avg 10 = 100; FIFO takes the 10@5 layer = 50.
    const f = fifoIssueCost(prior, 10);
    expect(f.cogs).toBe(50);
    expect(f.remainingValue).toBe(150); // 10 @ 15
  });

  it('receipt state reflects layered value', () => {
    const s = fifoReceiptState([{ direction: 'in', quantity: 4, unitCost: 3 }], 6, 7);
    expect(s.remainingQty).toBe(10);
    expect(s.remainingValue).toBe(54); // 4×3 + 6×7
  });
});
