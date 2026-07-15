import type { QuotationLine } from './quotation';

// Quotation pricing sheet — the INTERNAL cost & margin breakdown behind a client
// quotation revision. Each revision is its own quotation record, so each carries
// its own sheet. The client-facing sell price is the line's unitPrice; here we
// pair it with an internal unit cost to derive per-line and blended margin.

export interface QuotationPricingLine {
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  costTotal: number;
  sellTotal: number;
  marginAmount: number;
  /** null when there's nothing to sell (sell = 0). */
  marginPercent: number | null;
  /** null when there's no cost basis (cost = 0). */
  markupPercent: number | null;
}

export interface QuotationPricingSheet {
  lines: QuotationPricingLine[];
  totalCost: number;
  totalSell: number;
  marginAmount: number;
  marginPercent: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Compile the sheet from the quote lines + index-aligned unit costs (missing → 0). */
export function computeQuotationPricing(lines: QuotationLine[], unitCosts: number[] = []): QuotationPricingSheet {
  const rows: QuotationPricingLine[] = lines.map((l, i) => {
    const unitCost = Number(unitCosts[i] ?? 0);
    const costTotal = round2(l.quantity * unitCost);
    const sellTotal = l.lineNet; // quantity × unitPrice
    const marginAmount = round2(sellTotal - costTotal);
    return {
      description: l.description,
      quantity: l.quantity,
      unitCost,
      unitPrice: l.unitPrice,
      costTotal,
      sellTotal,
      marginAmount,
      marginPercent: sellTotal > 0 ? round2((marginAmount / sellTotal) * 100) : null,
      markupPercent: costTotal > 0 ? round2((marginAmount / costTotal) * 100) : null,
    };
  });
  const totalCost = round2(rows.reduce((s, r) => s + r.costTotal, 0));
  const totalSell = round2(rows.reduce((s, r) => s + r.sellTotal, 0));
  const marginAmount = round2(totalSell - totalCost);
  return {
    lines: rows,
    totalCost,
    totalSell,
    marginAmount,
    marginPercent: totalSell > 0 ? round2((marginAmount / totalSell) * 100) : null,
  };
}

/** Coerce an incoming unit-cost array to the quote's line count (non-negative numbers). */
export function normalizeUnitCosts(lineCount: number, unitCosts: unknown): number[] {
  const arr = Array.isArray(unitCosts) ? unitCosts : [];
  return Array.from({ length: lineCount }, (_, i) => {
    const n = Number(arr[i]);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
}
