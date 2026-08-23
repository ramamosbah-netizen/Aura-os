import { moneyNumber } from '../money';

// Pre-Award estimation CORE — the pure, tender-agnostic cost math shared by the Tender workspace and
// the Direct Pre-Award package. It knows nothing about tenders, BOQs or opportunities: it turns cost
// COMPONENTS + loading percentages into per-unit figures, and compiles a structured resource sheet
// into components. The owning aggregates (RateBuildUp/tenderId in tendering; EstimateRevision/basis
// in the package model) live in their own modules and CONSUME these functions. Extracted here so
// there is one estimation engine, never a copy.

export type CostType = 'material' | 'labour' | 'plant' | 'subcontract' | 'other';
export const COST_TYPES: readonly CostType[] = ['material', 'labour', 'plant', 'subcontract', 'other'];

export interface CostComponent {
  /** Stable id so a component can be sourced from a supplier quote (R5). */
  id?: string;
  costType: CostType;
  description: string;
  /** Resource quantity consumed per unit of the line. */
  quantity: number;
  unitCost: number;
  /** Derived: quantity × unitCost (per unit of the line). */
  amount: number;
}

/** A manpower block: count × hours at an hourly rate — PER LINE (how estimators plan). */
export interface ManpowerBlock {
  count: number;
  hours: number;
  /** AED per hour. */
  rate: number;
}

/** The structured internal pricing sheet for ONE line (mirrors the company's Cost & Resource sheet). */
export interface ResourceBreakdown {
  supplyUnitPrice: number;
  technician: ManpowerBlock;
  engineer: ManpowerBlock;
  projectManager: ManpowerBlock;
  transport: number;
  wastagePercent: number;
  accessories: number;
  subcontract: number;
  equipmentRent: number;
  otherDirect: number;
}

/** The per-unit figures the estimation engine derives from components + loadings. */
export interface BuildUpFigures {
  directCost: number;
  indirectAmount: number;
  overheadAmount: number;
  riskAmount: number;
  profitAmount: number;
  sellingRate: number;
}

const r2 = (n: number): number => moneyNumber(n);
const r4 = (n: number): number => moneyNumber(n, 4);

const nn = (v: unknown): number => {
  const n = Number(v) || 0;
  if (n < 0) throw new Error('resource figures cannot be negative');
  return n;
};

const manpower = (b: Partial<ManpowerBlock> | undefined): ManpowerBlock => ({
  count: nn(b?.count),
  hours: nn(b?.hours),
  rate: nn(b?.rate),
});

/** Normalize a raw sheet payload (all figures ≥ 0, numbers coerced). */
export function normalizeResourceBreakdown(input: Partial<ResourceBreakdown>): ResourceBreakdown {
  return {
    supplyUnitPrice: nn(input.supplyUnitPrice),
    technician: manpower(input.technician),
    engineer: manpower(input.engineer),
    projectManager: manpower(input.projectManager),
    transport: nn(input.transport),
    wastagePercent: nn(input.wastagePercent),
    accessories: nn(input.accessories),
    subcontract: nn(input.subcontract),
    equipmentRent: nn(input.equipmentRent),
    otherDirect: nn(input.otherDirect),
  };
}

/**
 * Compile the internal pricing sheet into per-unit cost components for the rate engine. Per-line
 * figures (manpower/transport/accessories/subcontract) divide by the line quantity; zero-amount
 * blocks are omitted. Pure.
 */
export function compileResourceBreakdown(
  input: Partial<ResourceBreakdown>,
  quantity: number,
): { resources: ResourceBreakdown; components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>> } {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('line quantity must be > 0 to compile a resource breakdown');
  const r = normalizeResourceBreakdown(input);

  const components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>> = [];
  if (r.supplyUnitPrice > 0) {
    components.push({ costType: 'material', description: 'Material supply', quantity: 1, unitCost: r.supplyUnitPrice });
  }
  if (r.supplyUnitPrice > 0 && r.wastagePercent > 0) {
    components.push({
      costType: 'material',
      description: `Wastage ${r.wastagePercent}%`,
      quantity: 1,
      unitCost: r4(r.supplyUnitPrice * (r.wastagePercent / 100)),
    });
  }
  if (r.accessories > 0) {
    components.push({ costType: 'material', description: 'Accessories & consumables', quantity: 1, unitCost: r4(r.accessories / qty) });
  }
  const roles: Array<[string, ManpowerBlock]> = [
    ['Technician', r.technician],
    ['Engineer', r.engineer],
    ['Project manager', r.projectManager],
  ];
  for (const [label, b] of roles) {
    const manHours = b.count * b.hours;
    if (manHours > 0 && b.rate > 0) {
      components.push({
        costType: 'labour',
        description: `${label} — ${b.count} × ${b.hours}h @ ${b.rate}/h`,
        quantity: r4(manHours / qty),
        unitCost: b.rate,
      });
    }
  }
  if (r.transport > 0) {
    components.push({ costType: 'plant', description: 'Transport', quantity: 1, unitCost: r4(r.transport / qty) });
  }
  if (r.equipmentRent > 0) {
    components.push({ costType: 'plant', description: 'Equipment rent', quantity: 1, unitCost: r4(r.equipmentRent / qty) });
  }
  if (r.subcontract > 0) {
    components.push({ costType: 'subcontract', description: 'Subcontracted works', quantity: 1, unitCost: r4(r.subcontract / qty) });
  }
  if (r.otherDirect > 0) {
    components.push({ costType: 'other', description: 'Other direct cost', quantity: 1, unitCost: r4(r.otherDirect / qty) });
  }
  if (components.length === 0) throw new Error('the resource breakdown has no cost — at least one filled block is required');
  return { resources: r, components };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE BOUNDARY (Slice 6A)
//
//   Estimation = what will it cost us?      Pricing = what will we sell it for?
//
// Layer 1 `computeCostBuildUp` answers the first question and stops. Layer 2
// `computeCommercialPricing` answers the second, and is the ONLY place a selling number is decided.
// `computeBuildUp` below is now a COMPOSITION of the two, kept byte-for-byte compatible because
// Tendering depends on its selling output structurally (the submission gate defines "priced" as
// sellingRate > 0). See docs/reports/2026-08-24-estimation-pricing-domain-audit.md.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Cost-side loadings. Every one of these is money the company actually expects to spend. */
export interface CostLoadings {
  /** Preliminaries: mobilization, supervision, site setup. */
  indirectPercent?: number;
  /**
   * DELIVERY overhead only — site supervision, temporary facilities, project/site overhead
   * allocation. **Not** commercial overhead recovery: an uplift charged to recover corporate
   * overhead is a pricing decision and belongs to Layer 2, or the same overhead gets loaded twice.
   */
  overheadPercent?: number;
  /** Risk / contingency / warranty provision — priced exposure, not margin. */
  riskPercent?: number;
}

/** What an Estimate commits to. `estimatedCost` is its canonical output — never a selling price. */
export interface CostEstimateFigures {
  directCost: number;
  indirectAmount: number;
  overheadAmount: number;
  riskAmount: number;
  /** direct + indirect + overhead + risk — the number Pricing starts from. */
  estimatedCost: number;
}

/**
 * Layer 1 — cost only. Rounds at exactly the points the pre-split engine rounded at, so composing
 * it with Layer 2 reproduces historical figures to the cent (pinned by the characterization tests).
 */
export function computeCostBuildUp(components: CostComponent[], loadings: CostLoadings = {}): CostEstimateFigures {
  const directCost = r2(components.reduce((s, c) => s + c.amount, 0));
  const indirectAmount = r2(directCost * ((loadings.indirectPercent ?? 0) / 100));
  const overheadAmount = r2(directCost * ((loadings.overheadPercent ?? 0) / 100));
  const costBase = directCost + indirectAmount + overheadAmount;
  const riskAmount = r2(costBase * ((loadings.riskPercent ?? 0) / 100));
  return { directCost, indirectAmount, overheadAmount, riskAmount, estimatedCost: r2(costBase + riskAmount) };
}

/**
 * How the selling price is decided. A discriminated union on purpose: a shape that could carry both
 * percentages, or neither, would store a bare number nobody can interpret later.
 */
export type PricingPolicy =
  | { method: 'target_margin'; percent: number }
  | { method: 'markup'; percent: number };

/** Commercial discount. Percentage or fixed amount — real discounts are often "AED 5,000". */
export type PricingDiscount =
  | { kind: 'percent'; value: number }
  | { kind: 'amount'; value: number };

/**
 * The commercial position, stated BOTH ways whichever way it was entered — so a stored figure can
 * always be read back unambiguously. 15% markup on 100 is a 13.0435% margin; the two are never the
 * same number, and the UI must never show a bare "%".
 */
export interface SellingFigures {
  estimatedCost: number;
  pricingMethod: PricingPolicy['method'];
  /** The percentage the user actually entered, in the method they chose. */
  inputPercent: number;
  markupPercent: number;
  marginPercent: number;
  grossProfit: number;
  preDiscountSell: number;
  discount: number;
  sellingPrice: number;
}

/** Margin is capped just below 100% — at 100% the sell price is undefined (divide by zero). */
const MAX_MARGIN_PERCENT = 99.9;

/**
 * Layer 2 — the commercial decision. AURA's canonical convention for Direct Pre-Award is
 * TARGET MARGIN on the selling price; markup is supported as an alternative INPUT and converted
 * explicitly. `markupPercent` and `marginPercent` always describe the REALISED position (after any
 * discount), so they never claim a margin the business is not actually getting.
 */
export function computeCommercialPricing(
  estimatedCost: number,
  policy: PricingPolicy,
  discount?: PricingDiscount,
): SellingFigures {
  const cost = r2(Math.max(0, Number(estimatedCost) || 0));
  const inputPercent = Math.max(0, Number(policy.percent) || 0);

  const preDiscountSell = policy.method === 'markup'
    ? r2(cost * (1 + inputPercent / 100))
    : r2(cost / (1 - Math.min(inputPercent, MAX_MARGIN_PERCENT) / 100));

  const discountAmount = !discount
    ? 0
    : discount.kind === 'percent'
      ? r2(preDiscountSell * (Math.min(Math.max(0, Number(discount.value) || 0), 100) / 100))
      : r2(Math.min(Math.max(0, Number(discount.value) || 0), preDiscountSell));

  const sellingPrice = r2(preDiscountSell - discountAmount);
  const grossProfit = r2(sellingPrice - cost);

  return {
    estimatedCost: cost,
    pricingMethod: policy.method,
    inputPercent,
    // 4dp: 15% markup ⇒ 13.0435% margin. Rounding these to 2dp would hide the conversion.
    markupPercent: cost > 0 ? r4((grossProfit / cost) * 100) : 0,
    marginPercent: sellingPrice > 0 ? r4((grossProfit / sellingPrice) * 100) : 0,
    grossProfit,
    preDiscountSell,
    discount: discountAmount,
    sellingPrice,
  };
}

/**
 * LEGACY ADAPTER — the pre-split signature, preserved for Tendering.
 *
 * It composes the two layers and returns the historical `BuildUpFigures`. `profitPercent` here is a
 * MARKUP on the estimated cost, which is what this engine has always computed. Direct Pre-Award no
 * longer calls this: it uses `computeCostBuildUp` and leaves the selling decision to Pricing.
 */
export function computeBuildUp(
  components: CostComponent[],
  overheadPercent: number,
  profitPercent: number,
  indirectPercent = 0,
  riskPercent = 0,
): BuildUpFigures {
  const cost = computeCostBuildUp(components, { indirectPercent, overheadPercent, riskPercent });
  const commercial = computeCommercialPricing(cost.estimatedCost, { method: 'markup', percent: profitPercent });
  return {
    directCost: cost.directCost,
    indirectAmount: cost.indirectAmount,
    overheadAmount: cost.overheadAmount,
    riskAmount: cost.riskAmount,
    profitAmount: commercial.grossProfit,
    sellingRate: commercial.sellingPrice,
  };
}
