/**
 * Straight-line depreciation schedule for a fixed asset.
 *
 *   annual = (purchaseCost − salvageValue) / usefulLifeYears
 *
 * The asset depreciates from its purchase cost down to the salvage value over its useful
 * life; the final year absorbs any rounding so the closing book value lands exactly on
 * salvage. Pure & framework-free so the figures stay unit-tested.
 */
export interface DepreciationInput {
  purchaseCost: number;
  purchaseDate: string; // YYYY-MM-DD
  usefulLifeYears: number;
  salvageValue?: number;
}

export interface DepreciationRow {
  year: number;
  openingValue: number;
  depreciation: number;
  accumulated: number;
  closingValue: number;
}

export interface DepreciationSchedule {
  method: 'straight-line';
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  annualDepreciation: number;
  schedule: DepreciationRow[];
}

const round2 = (n: number): number => Number(n.toFixed(2));

export function calculateDepreciation(input: DepreciationInput): DepreciationSchedule {
  const cost = Number(input.purchaseCost);
  const salvage = Number(input.salvageValue ?? 0);
  const life = Math.floor(Number(input.usefulLifeYears));

  if (!Number.isFinite(cost) || cost <= 0) throw new Error('purchaseCost must be positive');
  if (!Number.isFinite(life) || life < 1) throw new Error('usefulLifeYears must be at least 1');
  if (!Number.isFinite(salvage) || salvage < 0) throw new Error('salvageValue cannot be negative');
  if (salvage >= cost) throw new Error('salvageValue must be less than purchaseCost');

  const startYear = Number((input.purchaseDate ?? '').slice(0, 4)) || new Date().getUTCFullYear();
  const annual = round2((cost - salvage) / life);

  const schedule: DepreciationRow[] = [];
  let opening = cost;
  let accumulated = 0;

  for (let i = 1; i <= life; i++) {
    // Last year absorbs rounding so closing == salvage exactly.
    const depreciation = i === life ? round2(opening - salvage) : annual;
    accumulated = round2(accumulated + depreciation);
    const closing = round2(opening - depreciation);
    schedule.push({
      year: startYear + i - 1,
      openingValue: round2(opening),
      depreciation,
      accumulated,
      closingValue: closing,
    });
    opening = closing;
  }

  return {
    method: 'straight-line',
    purchaseCost: round2(cost),
    salvageValue: round2(salvage),
    usefulLifeYears: life,
    annualDepreciation: annual,
    schedule,
  };
}
