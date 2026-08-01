import { type Id, type EstimationLineInput, estimateLine, newId } from '@aura/shared';

// The PricingSheet — pricing as its OWN aggregate, not a JSON pocket inside a quotation.
//
// The commercial flow this models:
//
//   Opportunity → PricingSheet (the workspace) → freeze → Commercial Baseline → Quotation
//
// The sheet is the SOURCE OF TRUTH for how a price was built; the quotation is an output
// generated from it. Making it a first-class aggregate is what buys the things a JSON field
// never could: several sheets for one opportunity (option A vs option B), version comparison,
// reuse of a past sheet, and historical price analysis across sheets.
//
// LIFECYCLE: draft → frozen. A draft is edited freely in the workspace. FREEZING is the
// commercial commitment — the build-up behind the price becomes immutable, and generating a
// quotation from the sheet is done from that frozen truth. Re-pricing means a NEW VERSION
// (same chain, version+1), never editing what was frozen — the same discipline as quotation
// revisions and the R3 baseline.

export type PricingSheetStatus = 'draft' | 'frozen';

export interface PricingSheetTotals {
  totalCost: number;
  totalSell: number;
  /** Blended margin % over the whole sheet, by value. */
  marginPercent: number;
}

export interface PricingSheet {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** What this sheet prices — a human name: "Tower B — option A (Hikvision)". */
  name: string;
  /** The deal it prices. Optional — a sheet can be drafted before the deal exists. */
  opportunityId: Id | null;
  /** The quotation generated FROM this sheet, once one has been. Output, not owner. */
  quotationId: Id | null;
  /** Version within its chain — compare v1 vs v2 of the same pricing. */
  version: number;
  /** The sheet this one was revised from. */
  parentSheetId: Id | null;
  status: PricingSheetStatus;
  /** The line build-ups — the actual estimation, one entry per line. */
  lines: EstimationLineInput[];
  /** Computed rollup, refreshed on every save — cached so lists don't re-run the engine. */
  totals: PricingSheetTotals;
  frozenAt: string | null;
  frozenBy: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPricingSheet {
  tenantId: Id;
  companyId?: Id | null;
  name: string;
  opportunityId?: Id | null;
  quotationId?: Id | null;
  version?: number;
  parentSheetId?: Id | null;
  lines?: EstimationLineInput[];
  createdBy?: Id | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Roll the whole sheet up through the estimation engine — one number set, computed one way. */
export function computeSheetTotals(lines: EstimationLineInput[]): PricingSheetTotals {
  const results = lines.map(estimateLine);
  const totalCost = round2(results.reduce((s, r) => s + r.totalCost, 0));
  const totalSell = round2(results.reduce((s, r) => s + r.sellPrice, 0));
  const marginPercent = totalSell > 0 ? round2(((totalSell - totalCost) / totalSell) * 100) : 0;
  return { totalCost, totalSell, marginPercent };
}

export function makePricingSheet(input: NewPricingSheet, now = new Date()): PricingSheet {
  if (!input.name?.trim()) throw new Error('a pricing sheet needs a name');
  const lines = Array.isArray(input.lines) ? input.lines : [];
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    name: input.name.trim(),
    opportunityId: input.opportunityId ?? null,
    quotationId: input.quotationId ?? null,
    version: Number.isInteger(input.version) && input.version! >= 1 ? input.version! : 1,
    parentSheetId: input.parentSheetId ?? null,
    status: 'draft',
    lines,
    totals: computeSheetTotals(lines),
    frozenAt: null,
    frozenBy: null,
    createdAt: now.toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Replace the sheet's lines. Only a draft can change — a frozen build-up is what was committed to. */
export function withSheetLines(sheet: PricingSheet, lines: EstimationLineInput[]): PricingSheet {
  if (sheet.status !== 'draft') {
    throw new Error(`only a draft pricing sheet can be edited — ${sheet.name} v${sheet.version} is ${sheet.status}. Raise a new version.`);
  }
  return { ...sheet, lines, totals: computeSheetTotals(lines) };
}

/** Freeze — the commercial commitment. From here the build-up is immutable. */
export function freezeSheet(sheet: PricingSheet, actorId: Id | null, now = new Date()): PricingSheet {
  if (sheet.status !== 'draft') {
    throw new Error(`only a draft pricing sheet can be frozen — ${sheet.name} v${sheet.version} is already ${sheet.status}`);
  }
  if (sheet.lines.length === 0) throw new Error('an empty pricing sheet has nothing to freeze');
  return { ...sheet, status: 'frozen', frozenAt: now.toISOString(), frozenBy: actorId };
}

// ── Version comparison — what changed between two prices, line by line ──────────────
//
// The reason the sheet is an aggregate with a version chain: "v2 is 8% cheaper" is useless to an
// approver until it says WHERE — which lines were added, which removed, and which re-priced, with
// the cost and margin movement of each. Matching is by normalised description (the stable identity
// an estimator actually thinks in), and every number is recomputed through the one engine.

export interface SheetLineSnapshot {
  description: string;
  quantity: number;
  unitCost: number;
  unitSell: number;
  sellTotal: number;
  marginPercent: number;
}

export interface SheetLineChange {
  description: string;
  from: SheetLineSnapshot;
  to: SheetLineSnapshot;
  sellDiff: number;
  costDiff: number;
  marginDiffPoints: number;
}

export interface SheetComparison {
  from: { id: Id; version: number; status: PricingSheetStatus; totals: PricingSheetTotals };
  to: { id: Id; version: number; status: PricingSheetStatus; totals: PricingSheetTotals };
  costDiff: number;
  sellDiff: number;
  marginDiffPoints: number;
  added: SheetLineSnapshot[];
  removed: SheetLineSnapshot[];
  changed: SheetLineChange[];
  unchanged: number;
}

const normKey = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

function snapshotLine(l: EstimationLineInput): SheetLineSnapshot {
  const r = estimateLine(l);
  return {
    description: l.description,
    quantity: r.quantity,
    unitCost: r.unitCost,
    unitSell: r.unitSellPrice,
    sellTotal: r.sellPrice,
    marginPercent: r.marginPercent,
  };
}

/** Compare `from` (the reference — usually the frozen parent) with `to` (usually the new draft). */
export function compareSheets(from: PricingSheet, to: PricingSheet): SheetComparison {
  const a = new Map(from.lines.map((l) => [normKey(l.description), snapshotLine(l)]));
  const b = new Map(to.lines.map((l) => [normKey(l.description), snapshotLine(l)]));

  const added: SheetLineSnapshot[] = [];
  const removed: SheetLineSnapshot[] = [];
  const changed: SheetLineChange[] = [];
  let unchanged = 0;

  for (const [key, snapTo] of b) {
    const snapFrom = a.get(key);
    if (!snapFrom) { added.push(snapTo); continue; }
    const sellDiff = round2(snapTo.sellTotal - snapFrom.sellTotal);
    const costDiff = round2(snapTo.quantity * snapTo.unitCost - snapFrom.quantity * snapFrom.unitCost);
    if (sellDiff === 0 && costDiff === 0 && snapTo.quantity === snapFrom.quantity) { unchanged++; continue; }
    changed.push({
      description: snapTo.description,
      from: snapFrom,
      to: snapTo,
      sellDiff,
      costDiff,
      marginDiffPoints: round2(snapTo.marginPercent - snapFrom.marginPercent),
    });
  }
  for (const [key, snapFrom] of a) {
    if (!b.has(key)) removed.push(snapFrom);
  }

  return {
    from: { id: from.id, version: from.version, status: from.status, totals: from.totals },
    to: { id: to.id, version: to.version, status: to.status, totals: to.totals },
    costDiff: round2(to.totals.totalCost - from.totals.totalCost),
    sellDiff: round2(to.totals.totalSell - from.totals.totalSell),
    marginDiffPoints: round2(to.totals.marginPercent - from.totals.marginPercent),
    added,
    removed,
    changed,
    unchanged,
  };
}

/** A new draft version carrying the frozen build-up forward — re-pricing starts from the last truth. */
export function reviseSheet(sheet: PricingSheet, createdBy: Id | null, now = new Date()): PricingSheet {
  if (sheet.status !== 'frozen') {
    throw new Error(`only a frozen pricing sheet can be revised — a draft is simply edited`);
  }
  return makePricingSheet({
    tenantId: sheet.tenantId,
    companyId: sheet.companyId,
    name: sheet.name,
    opportunityId: sheet.opportunityId,
    quotationId: sheet.quotationId,
    version: sheet.version + 1,
    parentSheetId: sheet.id,
    lines: sheet.lines.map((l) => ({ ...l, labour: { ...l.labour } })),
    createdBy,
  }, now);
}
