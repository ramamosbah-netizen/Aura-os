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
