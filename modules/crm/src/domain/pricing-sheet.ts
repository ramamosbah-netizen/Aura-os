import {
  type Id, type EstimationLineInput, estimateLine, newId, moneyNumber as round2,
  type PricingPolicy, type PricingDiscount, type SellingFigures, computeCommercialPricing, emptyEstimationInput,
} from '@aura/shared';

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

/**
 * The COMMERCIAL DECISION on a package pricing sheet (Slice 7) — the editable draft state the
 * Pricing Workspace owns. The estimator's cost is fixed upstream and read-only here; this is the only
 * place the selling price is chosen. `figures` is always recomputed by the domain (never sent by the
 * UI) so markup% and margin% are shown together and can't be confused. Null on the older per-line
 * pricing flow (quotation/tender sheets), which prices through `lines` instead.
 */
export interface CommercialDecision {
  /** The approved estimate's estimatedCost, snapshotted when the pricing draft was opened. Read-only. */
  baselineCost: number;
  /** Provenance: which approved estimate revision this price is built on. */
  estimateRevisionId: Id;
  /** The chosen method + percent. Null on a fresh draft, before any decision. */
  policy: PricingPolicy | null;
  /** Optional commercial discount / adjustment. */
  discount: PricingDiscount | null;
  /** computeCommercialPricing(baselineCost, policy, discount). Null until a policy is set. */
  figures: SellingFigures | null;
}

export interface PricingSheet {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** What this sheet prices — a human name: "Tower B — option A (Hikvision)". */
  name: string;
  /** The deal it prices. Optional — a sheet can be drafted before the deal exists. */
  opportunityId: Id | null;
  /** The Pre-Award package this sheet prices (the governance owner). Null for legacy sheets. */
  packageId: Id | null;
  /** The approved estimate revision this pricing was built on (the P→E link in Q→P→E→B). */
  estimateRevisionId: Id | null;
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
  /** The commercial decision (Slice 7). Null for the older per-line pricing flow. */
  commercial: CommercialDecision | null;
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
  packageId?: Id | null;
  estimateRevisionId?: Id | null;
  quotationId?: Id | null;
  version?: number;
  parentSheetId?: Id | null;
  lines?: EstimationLineInput[];
  commercial?: CommercialDecision | null;
  createdBy?: Id | null;
}


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
    packageId: input.packageId ?? null,
    estimateRevisionId: input.estimateRevisionId ?? null,
    quotationId: input.quotationId ?? null,
    version: Number.isInteger(input.version) && input.version! >= 1 ? input.version! : 1,
    parentSheetId: input.parentSheetId ?? null,
    status: 'draft',
    lines,
    totals: computeSheetTotals(lines),
    commercial: input.commercial ?? null,
    frozenAt: null,
    frozenBy: null,
    createdAt: now.toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

// ── Package pricing (Slice 7) — the commercial decision on a cost baseline ────────────────────────
//
//   Approved Estimate → Pricing Draft → set policy → Freeze → Quotation
//
// The workspace never touches cost: `baselineCost` is the approved estimate's estimatedCost,
// snapshotted at open. The only decision here is the selling price, computed by the ONE engine
// (computeCommercialPricing) so markup and margin are always shown together and never confused.

/** Open a DRAFT package pricing sheet on a cost baseline — no policy decided yet. */
export function openCommercialPricing(input: {
  tenantId: Id; companyId?: Id | null; name: string; opportunityId: Id; packageId: Id;
  estimateRevisionId: Id; baselineCost: number; version?: number; parentSheetId?: Id | null; createdBy?: Id | null;
}, now = new Date()): PricingSheet {
  const commercial: CommercialDecision = {
    baselineCost: round2(Math.max(0, Number(input.baselineCost) || 0)),
    estimateRevisionId: input.estimateRevisionId,
    policy: null, discount: null, figures: null,
  };
  const sheet = makePricingSheet({
    tenantId: input.tenantId, companyId: input.companyId ?? null, name: input.name,
    opportunityId: input.opportunityId, packageId: input.packageId, estimateRevisionId: input.estimateRevisionId,
    version: input.version, parentSheetId: input.parentSheetId ?? null, lines: [], commercial, createdBy: input.createdBy ?? null,
  }, now);
  // Cost is known; sell is undecided until a policy is set.
  return { ...sheet, totals: { totalCost: commercial.baselineCost, totalSell: 0, marginPercent: 0 } };
}

/**
 * Preview the selling figures for a baseline + policy — PURE, no persistence. The Pricing Workspace
 * calls this to show the live "Estimated cost → margin/markup → gross → discount → final" breakdown
 * as the user types, so the number on screen always comes from the engine, never from React.
 */
export function previewCommercialPricing(baselineCost: number, policy: PricingPolicy, discount?: PricingDiscount | null): SellingFigures {
  return computeCommercialPricing(baselineCost, policy, discount ?? undefined);
}

/**
 * Apply a commercial policy to a DRAFT sheet — the editable decision. Recomputes figures via the
 * engine and builds the single carrier line forward so a quotation projected from a frozen sheet
 * reproduces exactly this selling price (no back-solving). Only a draft may change.
 */
export function applyPricingPolicy(sheet: PricingSheet, policy: PricingPolicy, discount: PricingDiscount | null): PricingSheet {
  if (sheet.status !== 'draft') {
    throw new Error(`only a draft pricing sheet can be priced — ${sheet.name} v${sheet.version} is ${sheet.status}. Raise a new version.`);
  }
  if (!sheet.commercial) throw new Error('cannot price a sheet with no cost baseline');
  const baselineCost = sheet.commercial.baselineCost;
  const figures = computeCommercialPricing(baselineCost, policy, discount ?? undefined);
  // Carrier line: cost = baselineCost, margin chosen so estimateLine reproduces figures.sellingPrice.
  const marginToReproduce = figures.sellingPrice > 0 ? (1 - baselineCost / figures.sellingPrice) * 100 : 0;
  const line: EstimationLineInput = {
    ...emptyEstimationInput(),
    description: `Selling price — ${policy.method === 'markup' ? `${policy.percent}% markup` : `${policy.percent}% target margin`}${discount ? ` less ${discount.kind === 'percent' ? `${discount.value}%` : `AED ${discount.value}`}` : ''}`,
    quantity: 1,
    subcontractUnitCost: baselineCost,
    targetMarginPercent: marginToReproduce,
  };
  const commercial: CommercialDecision = { ...sheet.commercial, policy, discount: discount ?? null, figures };
  const totals: PricingSheetTotals = { totalCost: baselineCost, totalSell: figures.sellingPrice, marginPercent: figures.marginPercent };
  return { ...sheet, lines: [line], commercial, totals };
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
  // A package pricing sheet must carry an explicit commercial decision before it can be frozen —
  // freezing is where the selling price is committed, and it is never a default (Slice 7). Checked
  // before the empty-lines guard so a package draft gets the real reason, not "nothing to freeze".
  if (sheet.commercial && !sheet.commercial.policy) {
    throw new Error('cannot freeze pricing without a policy — choose a target margin or markup first (pricing is a decision, not a default)');
  }
  if (sheet.lines.length === 0) throw new Error('an empty pricing sheet has nothing to freeze');
  return { ...sheet, status: 'frozen', frozenAt: now.toISOString(), frozenBy: actorId };
}

// ── Quotation generation — the sheet IS the quote's numbers ─────────────────────────
//
// A quotation raised off a Pre-Award package must carry the FROZEN sheet's own money. Re-deriving it
// from anywhere else (an opportunity's headline `value`, say) would make the governed chain a
// permission check with no hold over the number the customer actually receives.

export interface QuotationLineDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

/**
 * Project a FROZEN sheet into quotation lines. Each pricing line becomes one quotation line priced at
 * its own computed sell — so `sum(lineNet)` reproduces `sheet.totals.totalSell` exactly.
 */
export function quotationLinesFromSheet(sheet: PricingSheet, vatRate = 5): QuotationLineDraft[] {
  if (sheet.status !== 'frozen') {
    throw new Error(`only a frozen pricing sheet can be quoted — ${sheet.name} v${sheet.version} is ${sheet.status}`);
  }
  if (sheet.lines.length === 0) throw new Error('an empty pricing sheet has no lines to quote');
  return sheet.lines.map((line) => {
    const sellPrice = estimateLine(line).sellPrice;
    const quantity = Math.max(0, Number(line.quantity) || 0);
    // Unit price is derived so quantity × unitPrice === the line's committed sell price.
    const unitPrice = quantity > 0 ? round2(sellPrice / quantity) : round2(sellPrice);
    return { description: line.description, quantity: quantity > 0 ? quantity : 1, unitPrice, vatRate };
  });
}

/**
 * Record the quotation this sheet produced. Allowed on a FROZEN sheet on purpose: the link is an
 * OUTPUT of the committed price, not a change to it — lines and totals stay exactly as frozen.
 */
export function linkQuotation(sheet: PricingSheet, quotationId: Id): PricingSheet {
  if (sheet.quotationId && sheet.quotationId !== quotationId) {
    throw new Error(`only one quotation can be generated from a pricing sheet — ${sheet.name} v${sheet.version} is already linked to quotation ${sheet.quotationId}`);
  }
  return { ...sheet, quotationId };
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
