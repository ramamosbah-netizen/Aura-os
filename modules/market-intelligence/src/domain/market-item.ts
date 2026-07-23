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

  // ── identity — what EXACTLY this is, so two "cameras" are not confused
  /** Stock-keeping / part number. */
  sku: string | null;
  manufacturer: string | null;
  model: string | null;
  countryOfOrigin: string | null;

  // ── the price SPREAD, not just one number — what an estimator negotiates within
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;

  // ── delivery & productivity — the facts a materials-only price forgets
  /** Supply lead time in days. */
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  /** Typical crew size to install — seeds the estimation labour, with installHours. */
  crewSize: number | null;
  /**
   * Commissioning time per unit, in hours — distinct from installHours because hanging a device
   * and making it WORK are different jobs, and the second is the one estimates forget. The
   * workspace seeds labour with install + commissioning together.
   */
  commissioningHours: number | null;

  // ── knowledge graph
  /** Other market items that can substitute for this one. */
  alternativeIds: string[];
  datasheetUrl: string | null;
  imageUrl: string | null;

  /**
   * How much to trust this row, 0–100. A price from a signed supplier offer last week is high
   * confidence; one typed from memory a year ago is low. The Copilot weights its advice by it,
   * so a shaky benchmark does not get quoted as gospel.
   */
  confidence: number;

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
  sku?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  countryOfOrigin?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  avgPrice?: number | null;
  leadTimeDays?: number | null;
  warrantyMonths?: number | null;
  crewSize?: number | null;
  commissioningHours?: number | null;
  alternativeIds?: string[];
  datasheetUrl?: string | null;
  imageUrl?: string | null;
  confidence?: number;
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
    sku: input.sku?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    model: input.model?.trim() || null,
    countryOfOrigin: input.countryOfOrigin?.trim() || null,
    minPrice: input.minPrice == null ? null : nonNeg(input.minPrice, 'minPrice'),
    maxPrice: input.maxPrice == null ? null : nonNeg(input.maxPrice, 'maxPrice'),
    avgPrice: input.avgPrice == null ? null : nonNeg(input.avgPrice, 'avgPrice'),
    leadTimeDays: input.leadTimeDays == null ? null : nonNeg(input.leadTimeDays, 'leadTimeDays'),
    warrantyMonths: input.warrantyMonths == null ? null : nonNeg(input.warrantyMonths, 'warrantyMonths'),
    crewSize: input.crewSize == null ? null : Math.max(1, Math.floor(Number(input.crewSize) || 1)),
    commissioningHours: input.commissioningHours == null ? null : nonNeg(input.commissioningHours, 'commissioningHours'),
    alternativeIds: Array.isArray(input.alternativeIds) ? input.alternativeIds.filter(Boolean) : [],
    datasheetUrl: input.datasheetUrl?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
    // Confidence defaults to a middling 60 — present but unproven — clamped to 0–100.
    confidence: Math.min(100, Math.max(0, Math.round(Number(input.confidence ?? 60)))),
    createdAt: iso,
    createdBy: input.createdBy ?? null,
  };
}

/** Implied margin % of a benchmark — sell vs cost. Null when there is no sell or no cost to compare. */
export function marketItemMarginPercent(item: Pick<MarketItem, 'benchmarkCost' | 'benchmarkSell'>): number | null {
  if (item.benchmarkSell <= 0) return null;
  return Math.round(((item.benchmarkSell - item.benchmarkCost) / item.benchmarkSell) * 1000) / 10;
}
