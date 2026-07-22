import { type Id, newId } from '@aura/shared';

// Market Intelligence — the reference catalogue behind pricing.
//
// A quote is only as good as the numbers underneath it, and those numbers should not live in the
// estimator's head. A MarketItem is one thing you sell or install — a 4MP dome camera, a card
// reader, a metre of trunking — with what it TYPICALLY costs, what it TYPICALLY sells for, and how
// long it TYPICALLY takes to install. When an estimator adds a line to a pricing sheet, this is
// where the suggested cost, price and labour come from, so a fair number is the default rather
// than a guess.
//
// These are BENCHMARKS, not a price list a customer sees. They carry a source and an as-of date
// because a benchmark with no provenance is just a rumour — "Hikvision distributor offer, June
// 2026" can be trusted and aged; a bare number cannot.

export type MarketItemCategory =
  | 'CCTV'
  | 'ACCESS_CONTROL'
  | 'FIRE_ALARM'
  | 'PA_VA'
  | 'NETWORK'
  | 'INTERCOM'
  | 'BMS'
  | 'STRUCTURED_CABLING'
  | 'AUDIO_VISUAL'
  | 'OTHER';

export const MARKET_ITEM_CATEGORIES: readonly MarketItemCategory[] = [
  'CCTV', 'ACCESS_CONTROL', 'FIRE_ALARM', 'PA_VA', 'NETWORK',
  'INTERCOM', 'BMS', 'STRUCTURED_CABLING', 'AUDIO_VISUAL', 'OTHER',
];

export interface MarketItem {
  id: Id;
  tenantId: Id;
  /** What it is — "4MP IP Dome Camera". The thing an estimator searches for. */
  name: string;
  /** Make, when it matters to the price — "Hikvision", "Honeywell". Null for generic items. */
  brand: string | null;
  category: MarketItemCategory;
  /** How it is counted — "each", "m", "point", "set". Drives quantity on the quote line. */
  unit: string;
  /** Typical all-in unit cost to us (supply). The floor a margin is taken over. */
  benchmarkCost: number;
  /**
   * Typical sell price per unit. Kept EXPLICIT rather than always derived from cost, because the
   * market rate for a commodity item is a real fact — sometimes below what a fresh margin would
   * give — and an estimator pricing to win needs to see it.
   */
  benchmarkSell: number;
  /** Typical installation time per unit, in hours — the labour a naive cost forgets. */
  installHours: number;
  /** Where the benchmark came from — "supplier offer", "market survey", "won tender 2026". */
  source: string | null;
  /** The date the benchmark reflects (YYYY-MM-DD). A price is only as current as its as-of date. */
  asOf: string;
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewMarketItem {
  tenantId: Id;
  name: string;
  brand?: string | null;
  category?: MarketItemCategory;
  unit?: string;
  benchmarkCost?: number;
  benchmarkSell?: number;
  installHours?: number;
  source?: string | null;
  asOf?: string;
  notes?: string | null;
  createdBy?: Id | null;
}

const nonNeg = (v: number | undefined, field: string): number => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a non-negative number`);
  return Math.round(n * 100) / 100;
};

export function makeMarketItem(input: NewMarketItem, now = new Date()): MarketItem {
  if (!input.name?.trim()) throw new Error('a market item needs a name');
  const iso = now.toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    category: input.category ?? 'OTHER',
    unit: input.unit?.trim() || 'each',
    benchmarkCost: nonNeg(input.benchmarkCost, 'benchmarkCost'),
    benchmarkSell: nonNeg(input.benchmarkSell, 'benchmarkSell'),
    installHours: nonNeg(input.installHours, 'installHours'),
    source: input.source?.trim() || null,
    // Default the as-of to today: a benchmark entered now reflects now unless told otherwise.
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(input.asOf ?? '') ? input.asOf! : iso.slice(0, 10),
    notes: input.notes?.trim() || null,
    createdAt: iso,
    createdBy: input.createdBy ?? null,
  };
}

/** Implied margin % of a benchmark — sell vs cost. Null when there is no sell or no cost to compare. */
export function marketItemMarginPercent(item: Pick<MarketItem, 'benchmarkCost' | 'benchmarkSell'>): number | null {
  if (item.benchmarkSell <= 0) return null;
  return Math.round(((item.benchmarkSell - item.benchmarkCost) / item.benchmarkSell) * 1000) / 10;
}
