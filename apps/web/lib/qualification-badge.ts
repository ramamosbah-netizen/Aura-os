export type BadgeTone = 'good' | 'warn' | 'neutral';

/**
 * The header's BANT badge.
 *
 * THE DEFECT: the tone was `weak ? 'warn' : 'good'`, and `weak` is false for a closed deal (its
 * unanswered questions are history, not work). So a deal WON with 0/4 confirmed rendered a GREEN
 * 0/4 badge — the page praising coverage that never existed. That is `CLOSED ≠ healthy` in
 * miniature, the same conflation as reporting a finished pursuit as "on track".
 *
 * A closed deal's qualification is a RECORD, so it is stated, not judged: neutral tone. Green would
 * claim quality; amber would demand work on a deal nobody can work any more. Both are wrong, which
 * is why the fix is a third answer rather than flipping the colour.
 *
 * The label deliberately does NOT say "at award". These four booleans stay mutable after the deal
 * closes — one was observed changing on an already-Won record hours after its award — so no wording
 * here may imply the figure was snapshotted at award time. AURA has no immutable
 * qualification-at-award snapshot or event, and until it does, claiming that provenance would be
 * exactly the kind of overclaim this work exists to remove. It reports the CURRENT record instead.
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
  if (input.terminal) return { label: `Qualification record · ${input.confirmed}/${input.total} confirmed`, tone: 'neutral' };
  return { label: `${input.confirmed}/${input.total} BANT`, tone: input.weak ? 'warn' : 'good' };
}
