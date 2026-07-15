import { type Id, newId } from '@aura/shared';
import type { BOQItem } from './boq';

// Tendering domain — framework-free. A RateBuildUp is the estimator's cost build-up
// behind a BOQ item's rate: direct-cost components (material, labour, plant,
// subcontract) per unit, plus overhead and profit percentages, producing the selling
// rate. One build-up per BOQ item; the tender estimate folds build-ups over the BOQ.

export type CostType = 'material' | 'labour' | 'plant' | 'subcontract' | 'other';

export const COST_TYPES: readonly CostType[] = ['material', 'labour', 'plant', 'subcontract', 'other'];

export interface CostComponent {
  /** Stable id so a component can be sourced from a supplier quote (R5). Assigned by
   *  `makeRateBuildUp`; optional because build-ups persisted before R5 predate it. */
  id?: Id;
  costType: CostType;
  description: string;
  /** Resource quantity consumed per unit of the BOQ item. */
  quantity: number;
  unitCost: number;
  /** Derived: quantity × unitCost (per unit of the BOQ item). */
  amount: number;
}

/**
 * A manpower block from the company's internal "Cost & Resource Breakdown" sheet:
 * how many people × how many hours at what hourly rate — PER BOQ LINE (the way
 * estimators actually plan: "2 techs for 16 hours"), not per unit.
 */
export interface ManpowerBlock {
  count: number;
  hours: number;
  /** AED per hour. */
  rate: number;
}

/**
 * The structured internal pricing sheet for ONE BOQ item (mirrors the company's
 * Cost & Resource Breakdown sheet). All money figures are AED per LINE except
 * `supplyUnitPrice` (per BOQ unit); `compileResourceBreakdown` converts the sheet
 * into per-unit cost components so the existing rate engine and tender estimate
 * roll-ups work unchanged.
 */
export interface ResourceBreakdown {
  /** Material unit supply price (per BOQ unit). */
  supplyUnitPrice: number;
  technician: ManpowerBlock;
  engineer: ManpowerBlock;
  projectManager: ManpowerBlock;
  /** Transport for this line, AED. */
  transport: number;
  /** Wastage as % of material supply. */
  wastagePercent: number;
  /** Accessories/consumables for this line, AED lump. */
  accessories: number;
  /** Subcontracted works for this line, AED. */
  subcontract: number;
  /** Equipment/plant rental for this line, AED. */
  equipmentRent: number;
  /** Any other direct cost for this line, AED lump. */
  otherDirect: number;
}

export interface RateBuildUp {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  boqItemId: Id;
  components: CostComponent[];
  /** The structured sheet the components were compiled from (null when entered as raw components). */
  resources: ResourceBreakdown | null;
  /** Σ component amounts — direct cost per unit. */
  directCost: number;
  /** Indirect/preliminaries % on direct cost (mobilization, supervision, site setup). */
  indirectPercent: number;
  overheadPercent: number;
  profitPercent: number;
  /** directCost × indirectPercent. */
  indirectAmount: number;
  /** directCost × overheadPercent. */
  overheadAmount: number;
  /** (directCost + indirect + overhead) × profitPercent — profit is marked up on total cost. */
  profitAmount: number;
  /** directCost + indirect + overhead + profit — the rate the BOQ item should carry. */
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
  /** When the build-up came from the structured pricing sheet, keep it for redisplay. */
  resources?: ResourceBreakdown | null;
  indirectPercent?: number;
  overheadPercent?: number;
  profitPercent?: number;
  notes?: string | null;
  createdBy?: Id | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

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
 * Compile the internal pricing sheet into per-unit cost components for the rate
 * engine. Per-line figures (manpower/transport/accessories/subcontract) divide by
 * the BOQ quantity; zero-amount blocks are omitted. Pure.
 */
export function compileResourceBreakdown(
  input: Partial<ResourceBreakdown>,
  quantity: number,
): { resources: ResourceBreakdown; components: Array<Pick<CostComponent, 'costType' | 'description' | 'quantity' | 'unitCost'>> } {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('BOQ quantity must be > 0 to compile a resource breakdown');
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

/**
 * Pure engine: components + percentages → per-unit cost figures.
 * direct → + indirect % (preliminaries) → + overhead % → + profit % on the total cost.
 */
export function computeBuildUp(
  components: CostComponent[],
  overheadPercent: number,
  profitPercent: number,
  indirectPercent = 0,
): Pick<RateBuildUp, 'directCost' | 'indirectAmount' | 'overheadAmount' | 'profitAmount' | 'sellingRate'> {
  const directCost = r2(components.reduce((s, c) => s + c.amount, 0));
  const indirectAmount = r2(directCost * (indirectPercent / 100));
  const overheadAmount = r2(directCost * (overheadPercent / 100));
  const profitAmount = r2((directCost + indirectAmount + overheadAmount) * (profitPercent / 100));
  return {
    directCost,
    indirectAmount,
    overheadAmount,
    profitAmount,
    sellingRate: r2(directCost + indirectAmount + overheadAmount + profitAmount),
  };
}

export function makeRateBuildUp(input: NewRateBuildUp): RateBuildUp {
  if (!input.boqItemId) throw new Error('boqItemId is required');
  if (!Array.isArray(input.components) || input.components.length === 0) {
    throw new Error('at least one cost component is required');
  }
  const indirectPercent = Number(input.indirectPercent) || 0;
  const overheadPercent = Number(input.overheadPercent) || 0;
  const profitPercent = Number(input.profitPercent) || 0;
  if (indirectPercent < 0) throw new Error('indirectPercent cannot be negative');
  if (overheadPercent < 0) throw new Error('overheadPercent cannot be negative');
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

  const figures = computeBuildUp(components, overheadPercent, profitPercent, indirectPercent);
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
    profitPercent,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/**
 * Bid-time sourcing (R5): set ONE component's unit cost from a supplier quote and re-derive the
 * build-up (component amount → direct cost → indirect/overhead/profit → selling rate). Pure — the
 * caller persists the returned build-up and records the source-link separately. Throws if the
 * component id isn't in this build-up (e.g. a build-up rebuilt since it was sourced).
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
  const figures = computeBuildUp(components, buildUp.overheadPercent, buildUp.profitPercent, buildUp.indirectPercent);
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
  /** Σ indirect/preliminaries (mobilization, supervision, site setup) over estimated items. */
  totalIndirect: number;
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
  const directCostByType: Record<CostType, number> = { material: 0, labour: 0, plant: 0, subcontract: 0, other: 0 };
  let totalDirectCost = 0;
  let totalIndirect = 0;
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
    for (const c of b.components) directCostByType[c.costType] = r2((directCostByType[c.costType] ?? 0) + c.amount * item.quantity);
    totalDirectCost += b.directCost * item.quantity;
    totalIndirect += (b.indirectAmount ?? 0) * item.quantity;
    totalOverhead += b.overheadAmount * item.quantity;
    totalProfit += b.profitAmount * item.quantity;
    totalSellingValue += b.sellingRate * item.quantity;
  }

  totalDirectCost = r2(totalDirectCost);
  totalIndirect = r2(totalIndirect);
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
    totalIndirect,
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
  quotationGenerated: 'tendering.quotation.generated',
  // Bid-time sourcing (R5): a build-up component priced from / repriced against a supplier quote.
  componentSourced: 'tendering.estimate.component_sourced',
  sourceRestamped: 'tendering.estimate.source_restamped',
  sourceCleared: 'tendering.estimate.source_cleared',
} as const;
