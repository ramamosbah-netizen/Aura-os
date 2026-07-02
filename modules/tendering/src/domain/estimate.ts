import { type Id, newId } from '@aura/shared';
import type { BOQItem } from './boq';

// Tendering domain — framework-free. A RateBuildUp is the estimator's cost build-up
// behind a BOQ item's rate: direct-cost components (material, labour, plant,
// subcontract) per unit, plus overhead and profit percentages, producing the selling
// rate. One build-up per BOQ item; the tender estimate folds build-ups over the BOQ.

export type CostType = 'material' | 'labour' | 'plant' | 'subcontract';

export const COST_TYPES: readonly CostType[] = ['material', 'labour', 'plant', 'subcontract'];

export interface CostComponent {
  costType: CostType;
  description: string;
  /** Resource quantity consumed per unit of the BOQ item. */
  quantity: number;
  unitCost: number;
  /** Derived: quantity × unitCost (per unit of the BOQ item). */
  amount: number;
}

export interface RateBuildUp {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  boqItemId: Id;
  components: CostComponent[];
  /** Σ component amounts — direct cost per unit. */
  directCost: number;
  overheadPercent: number;
  profitPercent: number;
  /** directCost × overheadPercent. */
  overheadAmount: number;
  /** (directCost + overhead) × profitPercent — profit is marked up on total cost. */
  profitAmount: number;
  /** directCost + overhead + profit — the rate the BOQ item should carry. */
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
  overheadPercent?: number;
  profitPercent?: number;
  notes?: string | null;
  createdBy?: Id | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Pure engine: components + percentages → per-unit cost figures. */
export function computeBuildUp(
  components: CostComponent[],
  overheadPercent: number,
  profitPercent: number,
): Pick<RateBuildUp, 'directCost' | 'overheadAmount' | 'profitAmount' | 'sellingRate'> {
  const directCost = r2(components.reduce((s, c) => s + c.amount, 0));
  const overheadAmount = r2(directCost * (overheadPercent / 100));
  const profitAmount = r2((directCost + overheadAmount) * (profitPercent / 100));
  return { directCost, overheadAmount, profitAmount, sellingRate: r2(directCost + overheadAmount + profitAmount) };
}

export function makeRateBuildUp(input: NewRateBuildUp): RateBuildUp {
  if (!input.boqItemId) throw new Error('boqItemId is required');
  if (!Array.isArray(input.components) || input.components.length === 0) {
    throw new Error('at least one cost component is required');
  }
  const overheadPercent = Number(input.overheadPercent) || 0;
  const profitPercent = Number(input.profitPercent) || 0;
  if (overheadPercent < 0) throw new Error('overheadPercent cannot be negative');
  if (profitPercent < 0) throw new Error('profitPercent cannot be negative');

  const components: CostComponent[] = input.components.map((c) => {
    if (!COST_TYPES.includes(c.costType)) throw new Error(`invalid costType "${c.costType}"`);
    if (!c.description?.trim()) throw new Error('component description is required');
    const quantity = Number(c.quantity) || 0;
    const unitCost = Number(c.unitCost) || 0;
    if (quantity < 0) throw new Error('component quantity cannot be negative');
    if (unitCost < 0) throw new Error('component unitCost cannot be negative');
    return { costType: c.costType, description: c.description.trim(), quantity, unitCost, amount: r2(quantity * unitCost) };
  });

  const figures = computeBuildUp(components, overheadPercent, profitPercent);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    boqItemId: input.boqItemId,
    components,
    ...figures,
    overheadPercent,
    profitPercent,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
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
  totalOverhead: number;
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
  const directCostByType: Record<CostType, number> = { material: 0, labour: 0, plant: 0, subcontract: 0 };
  let totalDirectCost = 0;
  let totalOverhead = 0;
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
    for (const c of b.components) directCostByType[c.costType] = r2(directCostByType[c.costType] + c.amount * item.quantity);
    totalDirectCost += b.directCost * item.quantity;
    totalOverhead += b.overheadAmount * item.quantity;
    totalProfit += b.profitAmount * item.quantity;
    totalSellingValue += b.sellingRate * item.quantity;
  }

  totalDirectCost = r2(totalDirectCost);
  totalOverhead = r2(totalOverhead);
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
    totalOverhead,
    totalProfit,
    totalSellingValue,
    unpricedBoqValue,
    estimatedTenderValue: r2(totalSellingValue + unpricedBoqValue),
    marginPercent: totalSellingValue > 0 ? r2(((totalOverhead + totalProfit) / totalSellingValue) * 100) : 0,
  };
}

export const TENDER_ESTIMATE_EVENT = {
  rateBuilt: 'tendering.estimate.rate_built',
} as const;
