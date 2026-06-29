/**
 * Asset depreciation — a pure, stateless calculator (like the HR EOSB calc). Given an asset's
 * cost, salvage value, useful life and method, it produces the period-by-period schedule and the
 * net book value as of a date. Supports straight-line and double-declining-balance; both stop at
 * the salvage floor and never depreciate below it.
 */
export type DepreciationMethod = 'straight_line' | 'declining_balance';

export interface DepreciationPeriod {
  period: number; // 1-based month index
  depreciation: number;
  accumulated: number;
  bookValue: number;
}

export interface DepreciationSchedule {
  method: DepreciationMethod;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciableBase: number;
  periods: DepreciationPeriod[];
  monthsElapsed: number;
  accumulatedToDate: number;
  netBookValue: number;
}

export interface DepreciationInput {
  cost: number;
  salvageValue?: number;
  usefulLifeMonths: number;
  method?: DepreciationMethod;
  purchaseDate: string; // YYYY-MM-DD
  asOf: string; // YYYY-MM-DD
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Whole months between two YYYY-MM-DD dates (day-of-month ignored), clamped at 0. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export function computeDepreciation(input: DepreciationInput): DepreciationSchedule {
  const cost = Number(input.cost);
  const salvageValue = Number(input.salvageValue ?? 0);
  const life = Number(input.usefulLifeMonths);
  const method: DepreciationMethod = input.method ?? 'straight_line';
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('cost must be positive');
  if (!Number.isFinite(salvageValue) || salvageValue < 0) throw new Error('salvage value cannot be negative');
  if (salvageValue >= cost) throw new Error('salvage value must be less than cost');
  if (!Number.isInteger(life) || life < 1 || life > 600) throw new Error('useful life must be 1–600 months');

  const depreciableBase = round2(cost - salvageValue);
  const periods: DepreciationPeriod[] = [];
  let bookValue = cost;
  let accumulated = 0;

  const slPerMonth = round2(depreciableBase / life);
  const ddbRate = (2 / life); // double-declining

  for (let p = 1; p <= life; p++) {
    let dep: number;
    if (method === 'straight_line') {
      dep = p === life ? round2(depreciableBase - accumulated) : slPerMonth;
    } else {
      dep = round2(bookValue * ddbRate);
      if (bookValue - dep < salvageValue) dep = round2(bookValue - salvageValue); // floor at salvage
    }
    if (dep < 0) dep = 0;
    accumulated = round2(accumulated + dep);
    bookValue = round2(cost - accumulated);
    periods.push({ period: p, depreciation: dep, accumulated, bookValue });
  }

  const monthsElapsed = Math.min(monthsBetween(input.purchaseDate, input.asOf), life);
  const atDate = periods[monthsElapsed - 1];
  const accumulatedToDate = monthsElapsed === 0 ? 0 : atDate.accumulated;
  const netBookValue = monthsElapsed === 0 ? cost : atDate.bookValue;

  return {
    method,
    cost,
    salvageValue,
    usefulLifeMonths: life,
    depreciableBase,
    periods,
    monthsElapsed,
    accumulatedToDate,
    netBookValue,
  };
}
