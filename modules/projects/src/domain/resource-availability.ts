import type { ResourceRef } from './resource-ref';

/**
 * §22 — the OTHER half of the temporal invariant.
 *
 * The gate's sentence, in full (Design Gate §1.1, normative):
 *
 *   > A booking is valid AT CREATION only if capacity was available at that time. A later
 *   > availability change does not rewrite history and does not reject the owning domain's change;
 *   > it changes the booking's CURRENT FEASIBILITY and creates a visible resource conflict
 *   > requiring resolution.
 *
 * The first half has been true since Step 6: a commitment records what was known when it was made.
 * The second half was not connected to anything. Feasibility was recomputed only from §22's own
 * facts — declared capacity windows and other projects' bookings — so HR could approve a fortnight
 * of leave for a booked electrician, Fleet could take a booked van off the road, and every planning
 * screen went on saying the commitment was fine. "A later availability change" had nothing to
 * change through.
 *
 * WHAT THIS IS NOT. It is not a veto, and Projects does not become an approval step for HR or
 * Fleet. The leave is still approved; the van still goes in for its service; the booking is neither
 * rejected nor deleted. What changes is what the plan SAYS about itself, so a planner can act —
 * replace the resource, move the task, reduce the requirement, or accept the exposure knowingly
 * (DG-22.8: governed commitment, not hard lock).
 *
 * THE THREE STATES ARE KEPT APART, because collapsing them is how "unknown" quietly becomes
 * "fine" — the exact failure §22 was opened to fix:
 *
 *   absent      the register states the resource is not there on those days, and says until when
 *               (approved leave, a dated maintenance visit, a retired vehicle) → a KNOWN ZERO
 *   unknown     the register states it is out of service with NO stated end (a vehicle sitting at
 *               status `maintenance`) → capacity cannot be stated, and UNKNOWN is never AVAILABLE
 *   (silence)   the register says nothing → §22's own declared capacity stands, unchanged
 *
 * An undated out-of-service status is deliberately NOT read as absent for the rest of time: nobody
 * said when it ends, and a planner told "conflicted every day for a year" learns less than one told
 * "nobody can say what this machine's capacity is while it is out of service".
 */

/** Which register said so. Displayed, so a planner can go and ask the right people. */
export type AvailabilitySource = 'hr' | 'fleet' | 'assets';

export interface ResourceAvailabilityFact {
  resource: ResourceRef;
  /** Inclusive days (YYYY-MM-DD) this statement covers. */
  from: string;
  to: string;
  /** `absent` = a known zero on those days. `unknown` = the register cannot state a capacity. */
  effect: 'absent' | 'unknown';
  /** In the owning register's own words: "annual leave", "scheduled maintenance", "retired". */
  reason: string;
  source: AvailabilitySource;
}

/**
 * Reads availability from the registers that own it, bound at the composition root.
 *
 * A PORT, for the same reason `ResourceLabelResolver` is one: Projects may not import HR, Fleet or
 * Assets (ADR-0004). The implementation lives at the app layer, where those modules are already
 * known, and this stays a pure question with a data answer.
 *
 * UNBOUND IS A REAL STATE, not an error. §22 works without it exactly as it did before this
 * existed — declared capacity still governs, every verdict is still reached the same way — and a
 * composition with no HR or Fleet (a test, a no-database dev boot) must not be told that everything
 * is available. It is told nothing, which is what it knows.
 */
export const RESOURCE_AVAILABILITY_PROVIDER = Symbol('RESOURCE_AVAILABILITY_PROVIDER');

export interface ResourceAvailabilityProvider {
  /**
   * Every availability statement the owning registers make about `refs` over `interval`.
   *
   * Batched, because a planning screen asks about many resources and one round trip per row is how
   * it becomes slow enough that people stop opening it.
   */
  unavailability(
    tenantId: string,
    refs: readonly ResourceRef[],
    interval: { from: string; to: string },
  ): Promise<ResourceAvailabilityFact[]>;
}

/** Does this statement cover the given day? Inclusive at both ends. */
export const availabilityCovers = (fact: Pick<ResourceAvailabilityFact, 'from' | 'to'>, day: string): boolean =>
  day >= fact.from && day <= fact.to;
