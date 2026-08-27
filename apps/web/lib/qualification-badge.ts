export type BadgeTone = 'good' | 'warn' | 'neutral';

/**
 * The header's BANT badge.
 *
 * THE ORIGINAL DEFECT: the tone was `weak ? 'warn' : 'good'`, and `weak` is false for a closed deal
 * (its unanswered questions are history, not work). So a deal WON with 0/4 confirmed rendered a
 * GREEN 0/4 badge — the page praising coverage that never existed. That is `CLOSED ≠ healthy` in
 * miniature, the same conflation as reporting a finished pursuit as "on track".
 *
 * A closed deal's qualification is a RECORD, so it is stated, not judged: neutral tone. Green would
 * claim quality; amber would demand work on a deal nobody can work any more. Both are wrong, which
 * is why the fix is a third answer rather than flipping the colour.
 *
 * PROVENANCE (ADR-0020). This function previously could not say "at award" at ALL: the four BANT
 * booleans stay writable after a deal closes — one was observed changing on an already-Won record
 * 90 minutes after its award — so any temporal wording over them would have been an overclaim.
 * AURA now captures an immutable snapshot inside the award transaction, and the wording follows the
 * evidence:
 *
 *   terminal + snapshot   → "Qualification at award · N/4 confirmed"   (history — and N comes from
 *                            the SNAPSHOT, never from the mutable record)
 *   terminal, no snapshot → "Qualification record · N/4 confirmed"     (the CURRENT record; the deal
 *                            was closed without award provenance, so there is no history to show)
 *   open                  → "N/4 BANT"                                  (live, and judged)
 *
 * The signature is what makes that honest rather than a convention: the "at award" label is built
 * from `atAward`'s own counts, so it is not possible to write a call that prints historical wording
 * over current numbers. `confirmed`/`total` are never consulted on that branch.
 */
export function qualificationBadge(input: {
  confirmed: number;
  total: number;
  /** The pursuit is over. From the lifecycle resolver — never re-derived here. */
  terminal: boolean;
  /** The rules layer's verdict on thin coverage. */
  weak: boolean;
  /**
   * ADR-0020 — the immutable qualification-at-award snapshot's own counts, or null/absent meaning
   * NOT CAPTURED. Never pass the current record's numbers here: this is the only input that unlocks
   * historical wording, and it must carry the history it claims.
   */
  atAward?: { confirmed: number; total: number } | null;
}): { label: string; tone: BadgeTone } {
  if (input.terminal) {
    const at = input.atAward;
    // Deliberately reads `at.confirmed` / `at.total` — the snapshot speaks for itself.
    if (at) return { label: `Qualification at award · ${at.confirmed}/${at.total} confirmed`, tone: 'neutral' };
    return { label: `Qualification record · ${input.confirmed}/${input.total} confirmed`, tone: 'neutral' };
  }
  return { label: `${input.confirmed}/${input.total} BANT`, tone: input.weak ? 'warn' : 'good' };
}
