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
  /** True when the contract is expected to lose money (EAC exceeds contract value). */
  isOnerous: boolean;
  /** Total loss expected over the whole contract — 0 when profitable. */
  expectedTotalLoss: number;
  /**
   * The loss NOT yet captured by percentage-of-completion, which IAS 37 requires to be booked
   * immediately rather than spread over the remaining work. 0 for a profitable contract.
   */
  lossProvision: number;
  /**
   * True when the supplied estimate-at-completion was below the cost already incurred and had to
   * be raised to it. The estimate is stale: the job is then treated as 100% complete and the FULL
   * contract value is recognised, so this flag marks a figure that needs a re-forecast, not trust.
   */
  eacOverridden: boolean;
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

  // Onerous contracts (IAS 37, as applied to IFRS-15 contracts): when a contract is expected to
  // lose money, the ENTIRE expected loss is recognised as soon as it is known — it is not spread
  // across the remaining percentage of completion.
  //
  // Percentage-of-completion alone recognised only the share of the loss earned so far, so a job
  // worth 1,000,000 with a 1,200,000 forecast cost showed a 100,000 loss at halfway instead of the
  // required 200,000 — and, worse, showed NOTHING on the day it was signed, when the loss was
  // already certain. Profit was overstated for the whole life of every loss-making contract, which
  // for a contractor is exactly the contract someone needs to hear about early.
  const expectedTotalLoss = Math.max(0, r2(estimatedTotalCost - contractValue));
  const lossRecognisedByPoc = costIncurred - recognizedRevenue;
  const lossProvision = expectedTotalLoss > 0 ? Math.max(0, r2(expectedTotalLoss - lossRecognisedByPoc)) : 0;

  return {
    contractValue: r2(contractValue),
    costIncurred: r2(costIncurred),
    estimatedTotalCost: r2(estimatedTotalCost),
    percentComplete: r2(fraction * 100),
    recognizedRevenue,
    recognizedCost: r2(costIncurred),
    // Includes the onerous-contract provision, so this is the real P&L effect to date.
    grossProfitToDate: r2(recognizedRevenue - costIncurred - lossProvision),
    billedToDate: r2(billedToDate),
    overBilling: diff < 0 ? r2(-diff) : 0,
    underBilling: diff > 0 ? r2(diff) : 0,
    isOnerous: expectedTotalLoss > 0,
    expectedTotalLoss,
    lossProvision,
    eacOverridden: (Number(input.estimatedTotalCost) || 0) < costIncurred,
  };
}
