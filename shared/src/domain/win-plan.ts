// Win Plan (§14 / audit G16) — the deal STRATEGY, written down. S6/S7 capture what is
// happening (commitments, decisions, risks); none of it captures the PLAN: why the customer
// buys, why us, and how we intend to win. A deal without those answers is being chased on
// instinct — which works until the deal is big enough to matter.
//
// Deliberately ALL free text and ALL optional (§14: "do not make every field mandatory for
// every small deal"): a 20k AMC renewal doesn't need a procurement-path essay. Coverage is
// DERIVED per read and judged against the deal's size — never stored, never a gate.

export interface WinPlan {
  /** What the customer actually needs — in their words, not our product's. */
  customerNeed: string | null;
  /** The business outcome they buy (uptime, compliance, handover date), not the hardware. */
  businessOutcome: string | null;
  /** How they will decide: the written or unwritten criteria offers get scored on. */
  decisionCriteria: string | null;
  /** Who decides, in what order, by when — the process, not the org chart. */
  decisionProcess: string | null;
  /** Why now — the pain or deadline that stops this deal drifting forever. */
  painUrgency: string | null;
  /** Why us and not them — the differentiation we can actually defend. */
  differentiation: string | null;
  /** The play: how we intend to win THIS deal (not a mission statement). */
  winStrategy: string | null;
  /** Where we stand vs. the named competitors — ahead, behind, unknown. */
  competitivePosition: string | null;
  /** How the money moves: LPO, tender committee, consultant recommendation, … */
  procurementPath: string | null;
  /** What must be true at the end for the customer to call this a success. */
  successConditions: string | null;
}

export const WIN_PLAN_FIELDS: ReadonlyArray<{ key: keyof WinPlan; label: string }> = [
  { key: 'customerNeed', label: 'Customer need' },
  { key: 'businessOutcome', label: 'Business outcome' },
  { key: 'decisionCriteria', label: 'Decision criteria' },
  { key: 'decisionProcess', label: 'Decision process' },
  { key: 'painUrgency', label: 'Pain / urgency' },
  { key: 'differentiation', label: 'Differentiation' },
  { key: 'winStrategy', label: 'Win strategy' },
  { key: 'competitivePosition', label: 'Competitive position' },
  { key: 'procurementPath', label: 'Procurement path' },
  { key: 'successConditions', label: 'Success conditions' },
];

export const EMPTY_WIN_PLAN: WinPlan = Object.fromEntries(
  WIN_PLAN_FIELDS.map(({ key }) => [key, null]),
) as unknown as WinPlan;

/** Merge a patch onto a plan, keeping only known keys and trimming to null — a typo'd key or
 * an all-whitespace value must never persist. */
export function mergeWinPlan(current: WinPlan | null, patch: Partial<Record<keyof WinPlan, string | null>>): WinPlan {
  const base: WinPlan = { ...EMPTY_WIN_PLAN, ...(current ?? {}) };
  for (const { key } of WIN_PLAN_FIELDS) {
    if (patch[key] !== undefined) base[key] = patch[key]?.trim() || null;
  }
  return base;
}

/** §14's configurable methodology depth: which fields THIS deal's size expects. */
export function expectedWinPlanFields(value: number): ReadonlyArray<keyof WinPlan> {
  if (value >= 500_000) return WIN_PLAN_FIELDS.map((f) => f.key); // strategic — the full plan
  if (value >= 100_000) return ['customerNeed', 'decisionCriteria', 'differentiation', 'winStrategy', 'procurementPath'];
  return ['customerNeed', 'winStrategy']; // small deal — know the need, know the play
}

export interface WinPlanCoverage {
  filled: number;
  total: number;
  /** Expected-for-this-size fields still empty — the honest to-do, not a score. */
  gaps: Array<{ key: keyof WinPlan; label: string }>;
  /** Filled ÷ expected (not ÷ all ten) — a small deal with need + play reads complete. */
  coverage: number;
}

/** Derived on every read, never stored (same law as every CRM score). */
export function winPlanCoverage(plan: WinPlan | null, dealValue: number): WinPlanCoverage {
  const expected = expectedWinPlanFields(dealValue);
  const has = (k: keyof WinPlan): boolean => !!plan?.[k]?.trim();
  const filled = WIN_PLAN_FIELDS.filter(({ key }) => has(key)).length;
  const gaps = WIN_PLAN_FIELDS.filter(({ key }) => expected.includes(key) && !has(key));
  const expectedFilled = expected.filter((k) => has(k)).length;
  return {
    filled,
    total: WIN_PLAN_FIELDS.length,
    gaps,
    coverage: expected.length ? Math.round((expectedFilled / expected.length) * 100) : 100,
  };
}
