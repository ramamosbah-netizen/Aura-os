export type BadgeTone = 'good' | 'warn' | 'neutral';

/**
 * The header's BANT badge.
 *
 * THE DEFECT: the tone was `weak ? 'warn' : 'good'`, and `weak` is false for a closed deal (its
 * unanswered questions are history, not work). So a deal WON with 0/4 confirmed rendered a GREEN
 * 0/4 badge — the page praising coverage that never existed. That is `CLOSED ≠ healthy` in
 * miniature, the same conflation as reporting a finished pursuit as "on track".
 *
 * A closed deal's qualification is HISTORICAL EVIDENCE, so it is stated, not judged: neutral tone,
 * and the label says `at award` so the number reads as a record of what was known when the deal
 * closed. Green would claim quality; amber would demand work on a deal nobody can work any more.
 * Both are wrong, which is why the fix is a third answer rather than flipping the colour.
 *
 * Presentation only — it decides no business question. Whether coverage is thin is decided by
 * `qualificationCoverageLow` in the rules layer and arrives here as `weak`.
 */
export function qualificationBadge(input: {
  confirmed: number;
  total: number;
  /** The pursuit is over. From the lifecycle resolver — never re-derived here. */
  terminal: boolean;
  /** The rules layer's verdict on thin coverage. */
  weak: boolean;
}): { label: string; tone: BadgeTone } {
  const count = `${input.confirmed}/${input.total} BANT`;
  if (input.terminal) return { label: `${count} at award`, tone: 'neutral' };
  return { label: count, tone: input.weak ? 'warn' : 'good' };
}
