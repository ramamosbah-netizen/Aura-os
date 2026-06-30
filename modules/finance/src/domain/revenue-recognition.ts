// ============================================================
// Finance — Revenue Recognition (IFRS-15, cost-to-cost input method)
// ------------------------------------------------------------
// Percentage-of-completion measured by costs: % complete = cost incurred ÷ estimated
// total cost (capped at 100%). Recognised revenue = contract value × % complete. The
// recognised figure is then compared to amounts billed to date, yielding the contract
// position:
//   recognised > billed → under-billing  (contract ASSET — accrued/unbilled revenue)
//   billed > recognised → over-billing   (contract LIABILITY — deferred revenue)
// Pure and framework-free; the app layer feeds it cost (from Projects CBS/EVM), contract
// value, and billing (from Finance AR), so no module need depend on another.
// ============================================================

export interface RevenueRecognitionInput {
  /** Contract/booked value to recognise against (the project value carried from the contract). */
  contractValue: number;
  /** Actual cost incurred to date (e.g. CBS total actual). */
  costIncurred: number;
  /** Estimate at completion — total expected cost (e.g. CBS total forecast). */
  estimatedTotalCost: number;
  /** Net revenue billed to the client to date (ex-VAT). */
  billedToDate: number;
}

export interface RevenueRecognition {
  contractValue: number;
  costIncurred: number;
  estimatedTotalCost: number;
  percentComplete: number; // 0..100
  recognizedRevenue: number;
  recognizedCost: number;
  grossProfitToDate: number;
  billedToDate: number;
  /** Billed in excess of recognised — a contract liability (deferred revenue). */
  overBilling: number;
  /** Recognised in excess of billed — a contract asset (accrued/unbilled revenue). */
  underBilling: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function recognizeRevenue(input: RevenueRecognitionInput): RevenueRecognition {
  const contractValue = Number(input.contractValue) || 0;
  const costIncurred = Number(input.costIncurred) || 0;
  const billedToDate = Number(input.billedToDate) || 0;
  // EAC must be at least the cost already incurred, so % complete never exceeds 100%.
  const estimatedTotalCost = Math.max(Number(input.estimatedTotalCost) || 0, costIncurred);

  const fraction = estimatedTotalCost > 0 ? Math.min(costIncurred / estimatedTotalCost, 1) : 0;
  const recognizedRevenue = r2(contractValue * fraction);
  const diff = recognizedRevenue - billedToDate;

  return {
    contractValue: r2(contractValue),
    costIncurred: r2(costIncurred),
    estimatedTotalCost: r2(estimatedTotalCost),
    percentComplete: r2(fraction * 100),
    recognizedRevenue,
    recognizedCost: r2(costIncurred),
    grossProfitToDate: r2(recognizedRevenue - costIncurred),
    billedToDate: r2(billedToDate),
    overBilling: diff < 0 ? r2(-diff) : 0,
    underBilling: diff > 0 ? r2(diff) : 0,
  };
}
