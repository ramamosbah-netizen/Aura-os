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

/**
 * Pure engine: components + percentages → per-unit cost figures.
 * direct → + indirect % (preliminaries) → + overhead % → + risk % (contingency, on the whole cost
 * base) → + profit % on the total cost including risk. With riskPercent 0 the figures are exactly the
 * pre-T3 ones, so existing build-ups re-derive unchanged.
 */
export function computeBuildUp(
  components: CostComponent[],
  overheadPercent: number,
  profitPercent: number,
  indirectPercent = 0,
  riskPercent = 0,
): BuildUpFigures {
  const directCost = r2(components.reduce((s, c) => s + c.amount, 0));
  const indirectAmount = r2(directCost * (indirectPercent / 100));
  const overheadAmount = r2(directCost * (overheadPercent / 100));
  const costBase = directCost + indirectAmount + overheadAmount;
  const riskAmount = r2(costBase * (riskPercent / 100));
  const profitAmount = r2((costBase + riskAmount) * (profitPercent / 100));
  return {
    directCost,
    indirectAmount,
    overheadAmount,
    riskAmount,
    profitAmount,
    sellingRate: r2(costBase + riskAmount + profitAmount),
  };
}
