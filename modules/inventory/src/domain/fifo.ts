import type { StockDirection } from './stock';

/**
 * FIFO cost engine — replays movements chronologically into cost layers: a receipt pushes a
 * layer (qty @ unitCost), an issue consumes the oldest layers first (COGS at their cost).
 * WAC remains the GL posting method; this is an alternative valuation view.
 */
export interface FifoLayer { quantity: number; unitCost: number }
export interface FifoMove { direction: StockDirection; quantity: number; unitCost: number }

export interface FifoValuation {
  onHand: number;
  fifoValue: number;   // Σ remaining layer qty × unitCost
  cogsTotal: number;   // Σ cost of all issued units at FIFO
  layers: FifoLayer[]; // remaining, oldest first
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface FifoIssue {
  cogs: number;           // FIFO cost of the issued units
  unitCost: number;       // cogs / qty (the issue's COGS rate)
  remainingValue: number; // Σ remaining layer qty × unitCost after the issue
  remainingQty: number;
  avgCost: number;        // running FIFO average of remaining layers (value / qty)
}

/**
 * Cost of a single issue under FIFO, given the item's prior movement history (chronological).
 * Consumes the oldest layers for `issueQty` and returns the COGS + remaining-layer valuation —
 * the amount to post Dr COGS / Cr Inventory and the new inventory carrying value.
 */
export function fifoIssueCost(priorMoves: FifoMove[], issueQty: number): FifoIssue {
  const before = computeFifo(priorMoves);
  const after = computeFifo([...priorMoves, { direction: 'out', quantity: issueQty, unitCost: 0 }]);
  const cogs = r2(after.cogsTotal - before.cogsTotal);
  const qty = Number(issueQty) || 0;
  return {
    cogs,
    unitCost: qty > 0 ? r2(cogs / qty) : 0,
    remainingValue: after.fifoValue,
    remainingQty: after.onHand,
    avgCost: after.onHand > 0 ? r2(after.fifoValue / after.onHand) : 0,
  };
}

/** Remaining-layer valuation after a FIFO receipt of `qty @ unitCost` onto `priorMoves`. */
export function fifoReceiptState(priorMoves: FifoMove[], qty: number, unitCost: number): { remainingValue: number; remainingQty: number; avgCost: number } {
  const after = computeFifo([...priorMoves, { direction: 'in', quantity: qty, unitCost }]);
  return {
    remainingValue: after.fifoValue,
    remainingQty: after.onHand,
    avgCost: after.onHand > 0 ? r2(after.fifoValue / after.onHand) : 0,
  };
}

/** `moves` must be in chronological (oldest-first) order. */
export function computeFifo(moves: FifoMove[]): FifoValuation {
  const layers: FifoLayer[] = [];
  let cogsTotal = 0;
  for (const m of moves) {
    const qty = Number(m.quantity) || 0;
    if (qty <= 0) continue;
    if (m.direction === 'in') {
      layers.push({ quantity: qty, unitCost: Number(m.unitCost) || 0 });
    } else {
      let need = qty;
      while (need > 0 && layers.length > 0) {
        const layer = layers[0];
        const take = Math.min(need, layer.quantity);
        cogsTotal += take * layer.unitCost;
        layer.quantity -= take;
        need -= take;
        if (layer.quantity <= 0) layers.shift();
      }
    }
  }
  const onHand = r2(layers.reduce((s, l) => s + l.quantity, 0));
  const fifoValue = r2(layers.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  return { onHand, fifoValue, cogsTotal: r2(cogsTotal), layers: layers.map((l) => ({ quantity: r2(l.quantity), unitCost: l.unitCost })) };
}
