// The Estimation Engine — a professional cost build-up for one priced line.
//
// This is what turns a pricing sheet from an Excel grid into an estimating tool. Instead of typing
// a sell price, you build the cost the way an estimator actually does — materials, LABOUR driven by
// productivity (install hours × crew, not a guessed lump), equipment, consumables, subcontract —
// then load it with overhead, risk, warranty and contingency, and take a margin. The engine returns
// the full breakdown, the unit cost, the sell price, and the install DURATION, so the number is
// defensible line by line.
//
// Pure and framework-free on purpose: it lives in `shared` because CRM quoting AND Tendering
// estimation must compute the same way — one engine, not two that drift.

export interface LabourInput {
  /** Installation time per unit, in hours — the productivity number (from Market Intelligence). */
  hoursPerUnit: number;
  /** Crew size — technicians working in parallel. Drives DURATION, not total man-hours. */
  crewSize: number;
  /** Blended labour rate per man-hour. */
  hourlyRate: number;
}

export interface EstimationInput {
  quantity: number;
  /** Material supply cost per unit. */
  materialUnitCost: number;
  /** Wastage as a % of material. */
  wastagePercent: number;
  labour: LabourInput;
  /** Equipment / plant, per unit. */
  equipmentUnitCost: number;
  /** Consumables, per unit. */
  consumablesUnitCost: number;
  /** Subcontracted works, per unit. */
  subcontractUnitCost: number;
  /** Loadings on direct cost, each a %. */
  overheadPercent: number;
  riskPercent: number;
  warrantyPercent: number;
  contingencyPercent: number;
  /** Target margin on the SELL price (0–99.9). */
  targetMarginPercent: number;
}

export interface EstimationResult {
  quantity: number;
  // ── cost components (whole line)
  materialCost: number;
  labourCost: number;
  equipmentCost: number;
  consumablesCost: number;
  subcontractCost: number;
  directCost: number;
  overheadCost: number;
  riskCost: number;
  warrantyCost: number;
  contingencyCost: number;
  totalCost: number;
  // ── productivity
  /** Total man-hours = hoursPerUnit × quantity (crew size does not change the man-hours). */
  labourHours: number;
  /** Calendar days to install = man-hours / (crew × 8h). What a programme actually needs. */
  installDurationDays: number;
  // ── pricing
  unitCost: number;
  sellPrice: number;
  unitSellPrice: number;
  marginPercent: number;
  marginValue: number;
}

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const pct = (n: number): number => Math.max(0, Number(n) || 0) / 100;
const nonNeg = (n: number): number => Math.max(0, Number(n) || 0);

/** The sell price that yields `marginPercent` margin ON THE SELL over an all-in cost. */
export function sellFromMargin(totalCost: number, marginPercent: number): number {
  const m = Math.min(Math.max(Number(marginPercent) || 0, 0), 99.9) / 100;
  return round2(m <= 0 ? totalCost : totalCost / (1 - m));
}

export function estimateLine(input: EstimationInput): EstimationResult {
  const qty = Math.max(0, Number(input.quantity) || 0);

  // Materials, with wastage.
  const materialBase = nonNeg(input.materialUnitCost) * qty;
  const materialCost = round2(materialBase * (1 + pct(input.wastagePercent)));

  // Labour is productivity-driven: total man-hours × rate. Crew size does not change the man-hours
  // (two technicians finish sooner, they do not cost less per hour), it changes the DURATION.
  const labourHours = round2(nonNeg(input.labour?.hoursPerUnit) * qty);
  const labourCost = round2(labourHours * nonNeg(input.labour?.hourlyRate));
  const crew = Math.max(1, Math.floor(Number(input.labour?.crewSize) || 1));
  const installDurationDays = round2(labourHours / (crew * 8));

  const equipmentCost = round2(nonNeg(input.equipmentUnitCost) * qty);
  const consumablesCost = round2(nonNeg(input.consumablesUnitCost) * qty);
  const subcontractCost = round2(nonNeg(input.subcontractUnitCost) * qty);

  const directCost = round2(materialCost + labourCost + equipmentCost + consumablesCost + subcontractCost);

  // Loadings compound on the direct cost — each is an independent allowance, not stacked on the
  // previous, so the estimator can read exactly what each one added.
  const overheadCost = round2(directCost * pct(input.overheadPercent));
  const riskCost = round2(directCost * pct(input.riskPercent));
  const warrantyCost = round2(directCost * pct(input.warrantyPercent));
  const contingencyCost = round2(directCost * pct(input.contingencyPercent));

  const totalCost = round2(directCost + overheadCost + riskCost + warrantyCost + contingencyCost);
  const unitCost = qty > 0 ? round2(totalCost / qty) : 0;

  const sellPrice = sellFromMargin(totalCost, input.targetMarginPercent);
  const unitSellPrice = qty > 0 ? round2(sellPrice / qty) : 0;
  const marginValue = round2(sellPrice - totalCost);
  const marginPercent = sellPrice > 0 ? round2((marginValue / sellPrice) * 100) : 0;

  return {
    quantity: qty,
    materialCost, labourCost, equipmentCost, consumablesCost, subcontractCost,
    directCost, overheadCost, riskCost, warrantyCost, contingencyCost, totalCost,
    labourHours, installDurationDays,
    unitCost, sellPrice, unitSellPrice, marginPercent, marginValue,
  };
}

/**
 * An estimation input that names its item — one row of a pricing workspace. Carries the build-up
 * plus the description that becomes the quote line, and an optional link back to the Market
 * Intelligence item it was seeded from (so a benchmark can be traced and refreshed).
 */
export interface EstimationLineInput extends EstimationInput {
  description: string;
  marketItemId?: string | null;
}

/** An empty estimation input — every factor zero, one unit, ready to build up. */
export function emptyEstimationInput(): EstimationInput {
  return {
    quantity: 1,
    materialUnitCost: 0, wastagePercent: 0,
    labour: { hoursPerUnit: 0, crewSize: 1, hourlyRate: 0 },
    equipmentUnitCost: 0, consumablesUnitCost: 0, subcontractUnitCost: 0,
    overheadPercent: 0, riskPercent: 0, warrantyPercent: 0, contingencyPercent: 0,
    targetMarginPercent: 0,
  };
}
