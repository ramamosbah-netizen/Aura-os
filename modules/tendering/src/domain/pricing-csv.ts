import type { BOQItem } from './boq';
import type { RateBuildUp } from './estimate';

// Pricing-sheet CSV export — one row per BOQ item, mirroring the company's
// original "Cost & Resource Breakdown" spreadsheet columns. Pure row builders
// (the platform CSV pattern: shared toCsv + a @Header'd controller route).

const r2 = (n: number): number => Math.round(n * 100) / 100;

export const PRICING_SHEET_CSV_COLUMNS = [
  'itemCode',
  'description',
  'unit',
  'quantity',
  'supplyUnitPrice',
  'materialTotal',
  'wastagePercent',
  'accessories',
  'techCount',
  'techHours',
  'techRate',
  'techTotal',
  'engCount',
  'engHours',
  'engRate',
  'engTotal',
  'pmCount',
  'pmHours',
  'pmRate',
  'pmTotal',
  'manpowerTotal',
  'transport',
  'subcontract',
  'directCostLine',
  'overheadPercent',
  'profitPercent',
  'sellingRateUnit',
  'lineTotal',
  'marginPercent',
  'status',
] as const;

/** One spreadsheet row per BOQ item; unpriced items carry their BOQ rate only. */
export function pricingSheetCsvRows(items: BOQItem[], buildUps: RateBuildUp[]): Array<Record<string, string | number>> {
  const byItem = new Map(buildUps.map((b) => [b.boqItemId, b]));
  return items.map((item) => {
    const b = byItem.get(item.id);
    if (!b) {
      return {
        itemCode: item.itemCode,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        supplyUnitPrice: '', materialTotal: '', wastagePercent: '', accessories: '',
        techCount: '', techHours: '', techRate: '', techTotal: '',
        engCount: '', engHours: '', engRate: '', engTotal: '',
        pmCount: '', pmHours: '', pmRate: '', pmTotal: '',
        manpowerTotal: '', transport: '', subcontract: '',
        directCostLine: '', overheadPercent: '', profitPercent: '',
        sellingRateUnit: item.rate,
        lineTotal: item.totalAmount,
        marginPercent: '',
        status: 'unpriced (BOQ rate)',
      };
    }
    const r = b.resources;
    const qty = item.quantity;
    const tech = r ? r2(r.technician.count * r.technician.hours * r.technician.rate) : '';
    const eng = r ? r2(r.engineer.count * r.engineer.hours * r.engineer.rate) : '';
    const pm = r ? r2(r.projectManager.count * r.projectManager.hours * r.projectManager.rate) : '';
    const lineTotal = r2(b.sellingRate * qty);
    return {
      itemCode: item.itemCode,
      description: item.description,
      unit: item.unit,
      quantity: qty,
      supplyUnitPrice: r ? r.supplyUnitPrice : '',
      materialTotal: r ? r2(r.supplyUnitPrice * qty) : '',
      wastagePercent: r ? r.wastagePercent : '',
      accessories: r ? r.accessories : '',
      techCount: r ? r.technician.count : '',
      techHours: r ? r.technician.hours : '',
      techRate: r ? r.technician.rate : '',
      techTotal: tech,
      engCount: r ? r.engineer.count : '',
      engHours: r ? r.engineer.hours : '',
      engRate: r ? r.engineer.rate : '',
      engTotal: eng,
      pmCount: r ? r.projectManager.count : '',
      pmHours: r ? r.projectManager.hours : '',
      pmRate: r ? r.projectManager.rate : '',
      pmTotal: pm,
      manpowerTotal: r ? r2((tech as number) + (eng as number) + (pm as number)) : '',
      transport: r ? r.transport : '',
      subcontract: r ? r.subcontract : '',
      directCostLine: r2(b.directCost * qty),
      overheadPercent: b.overheadPercent,
      profitPercent: b.profitPercent,
      sellingRateUnit: b.sellingRate,
      lineTotal,
      marginPercent: b.sellingRate > 0 ? r2(((b.sellingRate - b.directCost) / b.sellingRate) * 100) : 0,
      status: r ? 'priced (sheet)' : 'priced (components)',
    };
  });
}

export const PRICING_SUMMARY_CSV_COLUMNS = [
  'tenderTitle',
  'reference',
  'client',
  'status',
  'boqItems',
  'pricedItems',
  'directCost',
  'overhead',
  'profit',
  'sellingValue',
  'unpricedBoqValue',
  'tenderValue',
  'marginPercent',
] as const;
