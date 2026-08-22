import { type Id, newId, moneyNumber, computeBuildUp, COST_TYPES, type CostType, type CostComponent } from '@aura/shared';
import type { BOQItem } from './boq';

// Tendering estimate — the TENDER-SPECIFIC layer over the shared estimation core. A RateBuildUp is the
// estimator's cost build-up behind a BOQ item's rate, anchored to a tender + BOQ item; the tender
// estimate folds build-ups over the BOQ. The cost MATH (components → figures, resource-sheet
// compilation) now lives in @aura/shared (one engine, no copy) and is re-exported here so existing
// `@aura/tendering` consumers keep importing it from this module unchanged.

export {
  COST_TYPES,
  computeBuildUp,
  compileResourceBreakdown,
  normalizeResourceBreakdown,
} from '@aura/shared';
export type {
  CostType,
  CostComponent,
  ManpowerBlock,
  ResourceBreakdown,
  BuildUpFigures,
} from '@aura/shared';

const r2 = (n: number): number => moneyNumber(n);

export interface RateBuildUp {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  boqItemId: Id;
  components: CostComponent[];
  /** The structured sheet the components were compiled from (null when entered as raw components). */
  resources: import('@aura/shared').ResourceBreakdown | null;
  /** Σ component amounts — direct cost per unit. */
  directCost: number;
  /** Indirect/preliminaries % on direct cost (mobilization, supervision, site setup). */
  indirectPercent: number;
  overheadPercent: number;
  /** Risk/contingency % on the full cost base (T3) — priced exposure, not padding hidden in rates. */
  riskPercent: number;
  profitPercent: number;
  indirectAmount: number;
  overheadAmount: number;
  riskAmount: number;
  profitAmount: number;
  /** directCost + indirect + overhead + risk + profit — the rate the BOQ item should carry. */
  sellingRate: number;
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewRateBuildUp {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  boqItemId: Id;
  components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>>;
  resources?: import('@aura/shared').ResourceBreakdown | null;
  indirectPercent?: number;
  overheadPercent?: number;
  riskPercent?: number;
  profitPercent?: number;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeRateBuildUp(input: NewRateBuildUp): RateBuildUp {
  if (!input.boqItemId) throw new Error('boqItemId is required');
  if (!Array.isArray(input.components) || input.components.length === 0) {
    throw new Error('at least one cost component is required');
  }
  const indirectPercent = Number(input.indirectPercent) || 0;
  const overheadPercent = Number(input.overheadPercent) || 0;
  const riskPercent = Number(input.riskPercent) || 0;
  const profitPercent = Number(input.profitPercent) || 0;
  if (indirectPercent < 0) throw new Error('indirectPercent cannot be negative');
  if (overheadPercent < 0) throw new Error('overheadPercent cannot be negative');
  if (riskPercent < 0) throw new Error('riskPercent cannot be negative');
  if (profitPercent < 0) throw new Error('profitPercent cannot be negative');

  const components: CostComponent[] = input.components.map((c) => {
    if (!COST_TYPES.includes(c.costType)) throw new Error(`invalid costType "${c.costType}"`);
    if (!c.description?.trim()) throw new Error('component description is required');
    const quantity = Number(c.quantity) || 0;
    const unitCost = Number(c.unitCost) || 0;
    if (quantity < 0) throw new Error('component quantity cannot be negative');
    if (unitCost < 0) throw new Error('component unitCost cannot be negative');
    return { id: newId(), costType: c.costType, description: c.description.trim(), quantity, unitCost, amount: r2(quantity * unitCost) };
  });

  const figures = computeBuildUp(components, overheadPercent, profitPercent, indirectPercent, riskPercent);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    boqItemId: input.boqItemId,
    components,
    resources: input.resources ?? null,
    ...figures,
    indirectPercent,
    overheadPercent,
    riskPercent,
    profitPercent,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/**
 * Bid-time sourcing (R5): set ONE component's unit cost from a supplier quote and re-derive the
 * build-up. Pure — the caller persists the returned build-up and records the source-link separately.
 * Throws if the component id isn't in this build-up (e.g. a build-up rebuilt since it was sourced).
 */
export function withComponentUnitCost(buildUp: RateBuildUp, componentId: Id, unitCost: number): RateBuildUp {
  const uc = Number(unitCost);
  if (!Number.isFinite(uc) || uc < 0) throw new Error('sourced unit cost cannot be negative');
  let found = false;
  const components = buildUp.components.map((c) => {
    if (c.id !== componentId) return c;
    found = true;
    return { ...c, unitCost: uc, amount: r2(c.quantity * uc) };
  });
  if (!found) throw new Error(`component ${componentId} not found in build-up ${buildUp.id}`);
  const figures = computeBuildUp(components, buildUp.overheadPercent, buildUp.profitPercent, buildUp.indirectPercent, buildUp.riskPercent);
  return { ...buildUp, components, ...figures };
}

// ── Tender-level estimate (fold build-ups over the BOQ) ─────────────────────

export interface TenderEstimate {
  tenderId: Id;
  boqId: Id;
  itemCount: number;
  /** Items with a rate build-up. */
  estimatedItemCount: number;
  /** Direct cost by resource type, extended by BOQ quantities. */
  directCostByType: Record<CostType, number>;
  totalDirectCost: number;
  totalIndirect: number;
  totalOverhead: number;
  totalRisk: number;
  totalProfit: number;
  /** Σ sellingRate × quantity over estimated items. */
  totalSellingValue: number;
  /** Σ current BOQ amounts over items WITHOUT a build-up. */
  unpricedBoqValue: number;
  /** totalSellingValue + unpricedBoqValue — the tender value the estimate supports. */
  estimatedTenderValue: number;
  /** Blended margin (overhead+profit) ÷ selling, over estimated items. 0 when nothing estimated. */
  marginPercent: number;
}

export function summariseEstimate(boqId: Id, tenderId: Id, items: BOQItem[], buildUps: RateBuildUp[]): TenderEstimate {
  const byItem = new Map(buildUps.map((b) => [b.boqItemId, b]));
  const directCostByType: Record<CostType, number> = { material: 0, labour: 0, plant: 0, subcontract: 0, other: 0 };
  let totalDirectCost = 0;
  let totalIndirect = 0;
  let totalOverhead = 0;
  let totalRisk = 0;
  let totalProfit = 0;
  let totalSellingValue = 0;
  let unpricedBoqValue = 0;
  let estimatedItemCount = 0;

  for (const item of items) {
    const b = byItem.get(item.id);
    if (!b) {
      unpricedBoqValue += item.totalAmount;
      continue;
    }
    estimatedItemCount += 1;
    for (const c of b.components) directCostByType[c.costType] = r2((directCostByType[c.costType] ?? 0) + c.amount * item.quantity);
    totalDirectCost += b.directCost * item.quantity;
    totalIndirect += (b.indirectAmount ?? 0) * item.quantity;
    totalOverhead += b.overheadAmount * item.quantity;
    totalRisk += (b.riskAmount ?? 0) * item.quantity;
    totalProfit += b.profitAmount * item.quantity;
    totalSellingValue += b.sellingRate * item.quantity;
  }

  totalDirectCost = r2(totalDirectCost);
  totalIndirect = r2(totalIndirect);
  totalOverhead = r2(totalOverhead);
  totalRisk = r2(totalRisk);
  totalProfit = r2(totalProfit);
  totalSellingValue = r2(totalSellingValue);
  unpricedBoqValue = r2(unpricedBoqValue);

  return {
    tenderId,
    boqId,
    itemCount: items.length,
    estimatedItemCount,
    directCostByType,
    totalDirectCost,
    totalIndirect,
    totalOverhead,
    totalRisk,
    totalProfit,
    totalSellingValue,
    unpricedBoqValue,
    estimatedTenderValue: r2(totalSellingValue + unpricedBoqValue),
    marginPercent: totalSellingValue > 0 ? r2(((totalOverhead + totalProfit) / totalSellingValue) * 100) : 0,
  };
}

export const TENDER_ESTIMATE_EVENT = {
  rateBuilt: 'tendering.estimate.rate_built',
  quotationGenerated: 'tendering.quotation.generated',
  // Bid-time sourcing (R5): a build-up component priced from / repriced against a supplier quote.
  componentSourced: 'tendering.estimate.component_sourced',
  sourceRestamped: 'tendering.estimate.source_restamped',
  sourceCleared: 'tendering.estimate.source_cleared',
} as const;
