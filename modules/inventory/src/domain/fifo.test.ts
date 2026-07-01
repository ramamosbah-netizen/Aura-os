import { describe, it, expect } from 'vitest';
import { computeFifo, type FifoMove } from './fifo';

const inn = (q: number, c: number): FifoMove => ({ direction: 'in', quantity: q, unitCost: c });
const out = (q: number): FifoMove => ({ direction: 'out', quantity: q, unitCost: 0 });

describe('fifo cost engine', () => {
  it('consumes oldest layers first (COGS at layer cost)', () => {
    // in 100@5, in 100@7, issue 150 → COGS 100×5 + 50×7 = 850; remaining 50@7 = 350
    const f = computeFifo([inn(100, 5), inn(100, 7), out(150)]);
    expect(f.cogsTotal).toBe(850);
    expect(f.onHand).toBe(50);
    expect(f.fifoValue).toBe(350);
    expect(f.layers).toEqual([{ quantity: 50, unitCost: 7 }]);
  });

  it('full depletion leaves no layers', () => {
    const f = computeFifo([inn(10, 4), out(10)]);
    expect(f.onHand).toBe(0);
    expect(f.fifoValue).toBe(0);
    expect(f.cogsTotal).toBe(40);
  });

  it('multiple receipts value at their own costs', () => {
    const f = computeFifo([inn(10, 4), inn(5, 6)]);
    expect(f.onHand).toBe(15);
    expect(f.fifoValue).toBe(70); // 40 + 30
  });
});
