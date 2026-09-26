import { estimateLine, moneyNumber, subMoney, type EstimationLineInput } from '@aura/shared';
import type { Quotation } from './quotation';

/**
 * COMPARE TWO REVISIONS OF ONE OFFER (EST-16 (d)) — computed here, rendered by the screen.
 *
 * Per BOQ item, matched by `sourceItemId` (a line with none is matched by its description): the
 * quantity, unit price and line total of each revision, and — from each revision's FROZEN estimation —
 * the direct cost and selling rate the price was built from. Totals for both. No figure is computed in
 * the browser, and nothing here is stored: both revisions are immutable records, so the comparison is
 * reproducible whenever it is asked.
 */
export interface RevisionFigures { quantity: number; unitPrice: number; lineTotal: number; directCost: number | null; sellingRate: number | null }
export interface RevisionComparisonRow { key: string; description: string; from: RevisionFigures | null; to: RevisionFigures | null; delta: number }
export interface RevisionComparison {
  quoteNumber: string;
  from: { id: string; revision: number; status: string; total: number };
  to: { id: string; revision: number; status: string; total: number };
  rows: RevisionComparisonRow[];
  totalDelta: number;
}

const keyOf = (l: { sourceItemId?: string | null; description: string }) => l.sourceItemId ?? `desc:${l.description}`;

function figures(q: Quotation): Map<string, { description: string; f: RevisionFigures }> {
  const estimation = new Map<string, EstimationLineInput>((q.estimation ?? []).map((e) => [keyOf(e), e]));
  const out = new Map<string, { description: string; f: RevisionFigures }>();
  for (const l of q.lines) {
    const key = keyOf(l);
    const e = estimation.get(key);
    const r = e ? estimateLine(e) : null;
    out.set(key, {
      description: l.description,
      f: { quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineNet, directCost: r ? r.directCost : null, sellingRate: r ? r.unitSellPrice : null },
    });
  }
  return out;
}

export function compareQuotationRevisions(from: Quotation, to: Quotation): RevisionComparison {
  if (from.tenantId !== to.tenantId || from.quoteNumber !== to.quoteNumber) {
    throw new Error('validation: only two revisions of the same offer can be compared');
  }
  const a = figures(from);
  const b = figures(to);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const rows = keys.map((key) => {
    const fa = a.get(key) ?? null;
    const fb = b.get(key) ?? null;
    return {
      key,
      description: (fb ?? fa)!.description,
      from: fa?.f ?? null,
      to: fb?.f ?? null,
      delta: moneyNumber(subMoney(fb?.f.lineTotal ?? 0, fa?.f.lineTotal ?? 0)),
    };
  });
  return {
    quoteNumber: from.quoteNumber,
    from: { id: from.id, revision: from.revision, status: from.status, total: from.total },
    to: { id: to.id, revision: to.revision, status: to.status, total: to.total },
    rows,
    totalDelta: moneyNumber(subMoney(to.total, from.total)),
  };
}
