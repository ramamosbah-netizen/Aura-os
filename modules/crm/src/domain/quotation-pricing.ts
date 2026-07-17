import type { QuotationLine, QuotationStatus } from './quotation';

// Quotation pricing sheet — the INTERNAL rate build-up behind a client quotation
// revision: every cost factor that makes up the line, rolled to direct cost →
// indirect (overhead) → total cost, then compared against the quoted sell price
// to derive profit / margin / markup.
//
// Factor names deliberately mirror the tender rate-buildup (modules/tendering
// `ResourceBreakdown`) so estimators read one vocabulary across tender and quote.
// Each revision is its own quotation record, so each carries its own sheet.

export interface ManpowerBlock {
  /** How many people. */
  count: number;
  /** Hours each. */
  hours: number;
  /** AED per hour. */
  rate: number;
}

/** The editable cost factors for one quotation line. */
export interface QuotationPricingLineInput {
  /** Material supply price per unit. */
  supplyUnitPrice: number;
  /** Wastage as a % of material supply. */
  wastagePercent: number;
  /** Accessories & consumables for this line, AED lump. */
  accessories: number;
  technician: ManpowerBlock;
  engineer: ManpowerBlock;
  projectManager: ManpowerBlock;
  /** Transport for this line, AED lump. */
  transport: number;
  /** Equipment / plant rental for this line, AED lump. */
  equipmentRent: number;
  /** Subcontracted works for this line, AED lump. */
  subcontract: number;
  /** Any other direct cost for this line, AED lump. */
  otherDirect: number;
  /** Indirect / overhead recovery as a % of direct cost. */
  indirectPercent: number;
}

/** Persisted per revision — one build-up per quotation line, index-aligned. */
export interface QuotationPricingInput {
  lines: QuotationPricingLineInput[];
}

export interface ManpowerLine extends ManpowerBlock {
  /** count × hours. */
  manHours: number;
  /** count × hours × rate. */
  total: number;
}

export interface QuotationPricingLine {
  description: string;
  quantity: number;
  // ── material
  supplyUnitPrice: number;
  supplyTotal: number;
  wastagePercent: number;
  wastageTotal: number;
  accessories: number;
  materialTotal: number;
  // ── manpower
  technician: ManpowerLine;
  engineer: ManpowerLine;
  projectManager: ManpowerLine;
  labourTotal: number;
  // ── other directs
  transport: number;
  equipmentRent: number;
  subcontract: number;
  otherDirect: number;
  // ── roll-up
  directCost: number;
  indirectPercent: number;
  indirectCost: number;
  costTotal: number;
  /** All-in cost per unit (costTotal / quantity). */
  unitCostTotal: number;
  // ── sell side (the quoted price is fixed; profit is what's left)
  unitPrice: number;
  sellTotal: number;
  profit: number;
  marginPercent: number | null;
  markupPercent: number | null;
}

export interface QuotationPricingSheet {
  lines: QuotationPricingLine[];
  totalSupply: number;
  totalWastage: number;
  totalAccessories: number;
  totalMaterial: number;
  totalLabour: number;
  totalTransport: number;
  totalEquipment: number;
  totalSubcontract: number;
  totalOtherDirect: number;
  totalDirect: number;
  totalIndirect: number;
  totalCost: number;
  totalSell: number;
  profit: number;
  marginPercent: number | null;
  markupPercent: number | null;
}

/** The sheet as the API serves it — the numbers plus its governance state. */
export interface QuotationPricingView extends QuotationPricingSheet {
  /** Frozen once the quotation is approved (see isPricingLocked); read/export/print only. */
  locked: boolean;
  status: QuotationStatus;
  quoteNumber: string;
  revision: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const block = (v: unknown): ManpowerBlock => {
  const b = (v ?? {}) as Partial<ManpowerBlock>;
  return { count: num(b.count), hours: num(b.hours), rate: num(b.rate) };
};

/** An empty build-up — every factor zero. */
export function emptyPricingLine(): QuotationPricingLineInput {
  return {
    supplyUnitPrice: 0, wastagePercent: 0, accessories: 0,
    technician: { count: 0, hours: 0, rate: 0 },
    engineer: { count: 0, hours: 0, rate: 0 },
    projectManager: { count: 0, hours: 0, rate: 0 },
    transport: 0, equipmentRent: 0, subcontract: 0, otherDirect: 0, indirectPercent: 0,
  };
}

function normalizeLine(v: unknown): QuotationPricingLineInput {
  const l = (v ?? {}) as Partial<QuotationPricingLineInput>;
  return {
    supplyUnitPrice: num(l.supplyUnitPrice),
    wastagePercent: num(l.wastagePercent),
    accessories: num(l.accessories),
    technician: block(l.technician),
    engineer: block(l.engineer),
    projectManager: block(l.projectManager),
    transport: num(l.transport),
    equipmentRent: num(l.equipmentRent),
    subcontract: num(l.subcontract),
    otherDirect: num(l.otherDirect),
    indirectPercent: num(l.indirectPercent),
  };
}

/**
 * Coerce stored/incoming pricing to exactly `lineCount` build-ups.
 * Accepts the legacy lean shape (`{ unitCosts: number[] }`) and lifts each cost
 * into `supplyUnitPrice`, so sheets saved before the full build-up still read.
 */
export function normalizePricingInput(lineCount: number, input: unknown): QuotationPricingLineInput[] {
  const raw = (input ?? {}) as { lines?: unknown; unitCosts?: unknown };
  const legacy = Array.isArray(raw.unitCosts) ? (raw.unitCosts as unknown[]) : null;
  const rows = Array.isArray(raw.lines) ? (raw.lines as unknown[]) : Array.isArray(input) ? (input as unknown[]) : [];
  return Array.from({ length: lineCount }, (_, i) => {
    if (rows[i] !== undefined) return normalizeLine(rows[i]);
    if (legacy) return { ...emptyPricingLine(), supplyUnitPrice: num(legacy[i]) };
    return emptyPricingLine();
  });
}

function manpower(b: ManpowerBlock): ManpowerLine {
  const manHours = round2(b.count * b.hours);
  return { ...b, manHours, total: round2(manHours * b.rate) };
}

/**
 * The sell unit price that yields `targetMarginPercent` margin on an all-in unit cost.
 * Margin is taken on the SELL price (the sheet's headline margin): sell = cost / (1 − m).
 * This is the AUTHORING direction — cost build-up + desired margin ⇒ the price to quote,
 * the inverse of the sell-fixed sheet where margin falls out. Clamped to [0, 99.9)%.
 */
export function deriveSellUnitPrice(unitCostAllIn: number, targetMarginPercent: number): number {
  const cost = num(unitCostAllIn);
  const m = Math.min(Math.max(num(targetMarginPercent), 0), 99.9) / 100;
  return round2(m <= 0 ? cost : cost / (1 - m));
}

/** Compile the full sheet from the quote lines + their build-ups. */
export function computeQuotationPricing(lines: QuotationLine[], input?: unknown): QuotationPricingSheet {
  const buildups = normalizePricingInput(lines.length, input);

  const rows: QuotationPricingLine[] = lines.map((l, i) => {
    const b = buildups[i];
    const supplyTotal = round2(l.quantity * b.supplyUnitPrice);
    const wastageTotal = round2(supplyTotal * (b.wastagePercent / 100));
    const materialTotal = round2(supplyTotal + wastageTotal + b.accessories);

    const technician = manpower(b.technician);
    const engineer = manpower(b.engineer);
    const projectManager = manpower(b.projectManager);
    const labourTotal = round2(technician.total + engineer.total + projectManager.total);

    const directCost = round2(
      materialTotal + labourTotal + b.transport + b.equipmentRent + b.subcontract + b.otherDirect,
    );
    const indirectCost = round2(directCost * (b.indirectPercent / 100));
    const costTotal = round2(directCost + indirectCost);

    const sellTotal = l.lineNet; // quantity × unitPrice
    const profit = round2(sellTotal - costTotal);

    return {
      description: l.description,
      quantity: l.quantity,
      supplyUnitPrice: b.supplyUnitPrice,
      supplyTotal,
      wastagePercent: b.wastagePercent,
      wastageTotal,
      accessories: b.accessories,
      materialTotal,
      technician,
      engineer,
      projectManager,
      labourTotal,
      transport: b.transport,
      equipmentRent: b.equipmentRent,
      subcontract: b.subcontract,
      otherDirect: b.otherDirect,
      directCost,
      indirectPercent: b.indirectPercent,
      indirectCost,
      costTotal,
      unitCostTotal: l.quantity > 0 ? round2(costTotal / l.quantity) : 0,
      unitPrice: l.unitPrice,
      sellTotal,
      profit,
      marginPercent: sellTotal > 0 ? round2((profit / sellTotal) * 100) : null,
      markupPercent: costTotal > 0 ? round2((profit / costTotal) * 100) : null,
    };
  });

  const sum = (pick: (r: QuotationPricingLine) => number): number => round2(rows.reduce((s, r) => s + pick(r), 0));
  const totalCost = sum((r) => r.costTotal);
  const totalSell = sum((r) => r.sellTotal);
  const profit = round2(totalSell - totalCost);

  return {
    lines: rows,
    totalSupply: sum((r) => r.supplyTotal),
    totalWastage: sum((r) => r.wastageTotal),
    totalAccessories: sum((r) => r.accessories),
    totalMaterial: sum((r) => r.materialTotal),
    totalLabour: sum((r) => r.labourTotal),
    totalTransport: sum((r) => r.transport),
    totalEquipment: sum((r) => r.equipmentRent),
    totalSubcontract: sum((r) => r.subcontract),
    totalOtherDirect: sum((r) => r.otherDirect),
    totalDirect: sum((r) => r.directCost),
    totalIndirect: sum((r) => r.indirectCost),
    totalCost,
    totalSell,
    profit,
    marginPercent: totalSell > 0 ? round2((profit / totalSell) * 100) : null,
    markupPercent: totalCost > 0 ? round2((profit / totalCost) * 100) : null,
  };
}
