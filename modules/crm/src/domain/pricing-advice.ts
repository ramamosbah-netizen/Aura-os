// Pricing advice — grounded findings about a pricing sheet, before any AI narrates them.
//
// The AI layer is only trustworthy if what it says is anchored to facts. So the analysis is a pure
// function over real numbers — the line's own margin, the catalogue benchmark, and what the shop
// quoted before — and it produces findings a person could verify. The AI turns these into prose;
// it does not invent them. If the AI is unavailable, the findings still stand on their own.

export interface SheetLineForAdvice {
  description: string;
  quantity: number;
  /** All-in unit cost. */
  unitCost: number;
  /** The sell price on the line. */
  unitPrice: number;
}

/** Catalogue benchmark for a line, when one was matched. */
export interface BenchmarkRef {
  benchmarkCost: number;
  benchmarkSell: number;
  source: string | null;
}

/** What the line was quoted for historically, when found. */
export interface HistoricRef {
  lastPrice: number;
  minPrice: number;
  maxPrice: number;
  count: number;
}

export interface LineRefs {
  benchmark?: BenchmarkRef | null;
  historic?: HistoricRef | null;
}

export type MarginBand = 'loss' | 'thin' | 'healthy' | 'high';

export interface LineFinding {
  description: string;
  marginPercent: number;
  band: MarginBand;
  /** Human-readable flags — what an estimator should look at on this line. */
  notes: string[];
}

export interface PricingAdvice {
  /** Blended margin across the whole sheet, by value. */
  blendedMargin: number;
  lossLines: number;
  thinLines: number;
  aboveMarketLines: number;
  belowMarketLines: number;
  findings: LineFinding[];
  /** A one-line summary the UI shows even before the AI narrative loads. */
  headline: string;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const marginPct = (cost: number, price: number): number => (price > 0 ? round1(((price - cost) / price) * 100) : 0);

function bandOf(margin: number): MarginBand {
  if (margin < 0) return 'loss';
  if (margin < 10) return 'thin';
  if (margin > 35) return 'high';
  return 'healthy';
}

const money = (n: number): string => Math.round(n).toLocaleString('en-AE');

/**
 * Analyse a sheet against its references. Pure and deterministic — the same inputs always give the
 * same findings, which is what lets the AI narrative be checked against them.
 */
export function analysePricing(lines: SheetLineForAdvice[], refs: LineRefs[]): PricingAdvice {
  const findings: LineFinding[] = lines.map((l, i) => {
    const margin = marginPct(l.unitCost, l.unitPrice);
    const notes: string[] = [];
    const ref = refs[i] ?? {};

    if (margin < 0) notes.push(`Sells below cost — losing ${money(l.unitCost - l.unitPrice)}/unit.`);
    else if (margin < 10) notes.push(`Thin margin (${margin}%) — little room for a discount.`);
    else if (margin > 35) notes.push(`High margin (${margin}%) — competitive risk if the market is keen.`);

    if (ref.benchmark && ref.benchmark.benchmarkSell > 0) {
      const b = ref.benchmark.benchmarkSell;
      if (l.unitPrice > b * 1.15) notes.push(`${round1(((l.unitPrice - b) / b) * 100)}% above the catalogue benchmark (${money(b)}) — may lose on price.`);
      else if (l.unitPrice < b * 0.9) notes.push(`Below the catalogue benchmark (${money(b)}) — likely leaving money on the table.`);
      if (l.unitCost > ref.benchmark.benchmarkCost * 1.2) notes.push(`Cost is above the benchmark cost (${money(ref.benchmark.benchmarkCost)}) — check the supplier price.`);
    }

    if (ref.historic && ref.historic.count > 0) {
      const h = ref.historic;
      if (l.unitPrice > h.maxPrice) notes.push(`Higher than any past quote for this (max ${money(h.maxPrice)}).`);
      else if (l.unitPrice < h.minPrice) notes.push(`Lower than any past quote for this (min ${money(h.minPrice)}).`);
    }

    return { description: l.description, marginPercent: margin, band: bandOf(margin), notes };
  });

  const totalCost = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
  const totalSell = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const blendedMargin = totalSell > 0 ? round1(((totalSell - totalCost) / totalSell) * 100) : 0;
  const lossLines = findings.filter((f) => f.band === 'loss').length;
  const thinLines = findings.filter((f) => f.band === 'thin').length;
  const aboveMarketLines = findings.filter((f) => f.notes.some((n) => n.includes('above the catalogue') || n.includes('Higher than any past'))).length;
  const belowMarketLines = findings.filter((f) => f.notes.some((n) => n.includes('Below the catalogue') || n.includes('Lower than any past'))).length;

  const parts: string[] = [`Blended margin ${blendedMargin}%`];
  if (lossLines) parts.push(`${lossLines} line${lossLines > 1 ? 's' : ''} below cost`);
  if (thinLines) parts.push(`${thinLines} thin`);
  if (aboveMarketLines) parts.push(`${aboveMarketLines} above market`);
  if (belowMarketLines) parts.push(`${belowMarketLines} below market`);
  const headline = parts.join(' · ');

  return { blendedMargin, lossLines, thinLines, aboveMarketLines, belowMarketLines, findings, headline };
}
