import type { Id } from '@aura/shared';
import { workingDaysInRange, ALL_DAYS_WORKING, type WorkingCalendar } from './working-calendar';

/**
 * §22 — what a recovery proposal would actually recover.
 *
 * A RECOVERY PROPOSAL IS A SCENARIO. It is stored beside the programme, changes not one stored
 * date, and becomes current only through a governed acceptance by somebody who holds the authority
 * to move a programme. That distinction is the whole of this capability: a re-plan that quietly
 * became the plan is how a project's dates stop meaning anything, because nobody can say when they
 * last agreed to them.
 *
 * The figure a recovery is judged on is not the proposal's finish date on its own — it is the
 * comparison:
 *
 *   CURRENT    when the programme, as it stands and as people are working to it, finishes.
 *   PROPOSED   when it would finish if this scenario were accepted.
 *   RECOVERED  the working days between them. Positive is time won back; ZERO is the honest and
 *              common answer that the re-plan found nothing; NEGATIVE means the scenario is worse
 *              than the programme it would replace, and saying so is the point — a recovery
 *              proposal that loses time is exactly the one nobody should accept by reflex.
 *
 * Counted in WORKING days under the project's calendar, for the same reason a delay is (PLN-03): a
 * week recovered across a shutdown recovers nothing.
 *
 * WHAT IT RECOVERS AGAINST is also not the same question as what a delay cost. A proposal prepared
 * for a delay carries that delay's assessed impact frozen at the hand-off, so the two can be read
 * side by side — "assessed at 6 days lost, this recovers 4" — without either being derived from the
 * other. They are separate assessments of separate things and are allowed to disagree.
 */

export type RecoveryVerdict = 'RECOVERS_TIME' | 'NO_CHANGE' | 'LOSES_TIME' | 'UNKNOWN';

export interface RecoveryComparison {
  /** Completion under the programme as it stands. */
  currentFinish: string | null;
  /** Completion if this scenario were accepted. */
  proposedFinish: string | null;
  /** Working days between them. Negative means the scenario finishes later. */
  workingDaysRecovered: number | null;
  /** The delay this recovery was prepared for, when it was prepared for one. */
  sourceDelayId: Id | null;
  /** That delay's assessed impact, frozen at the hand-off. */
  sourceAssessmentImpactDays: number | null;
  verdict: RecoveryVerdict;
  unknownReason: string | null;
}

export interface RecoveryComparisonInput {
  /** The programme's current finish, from its own dates. */
  currentFinish: string | null;
  /** The proposal's finish, from the run. */
  proposedFinish: string | null;
  /** Did the solver produce a usable plan at all? */
  established: boolean;
  calendar?: WorkingCalendar;
  sourceDelayId?: Id | null;
  sourceAssessmentImpactDays?: number | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Compare a scenario against the programme it would replace.
 *
 * PURE. The interesting cases are the ones a screen must not round away: a proposal that recovers
 * nothing, and one that is worse than what it replaces.
 */
export function compareRecovery(input: RecoveryComparisonInput): RecoveryComparison {
  const known = {
    currentFinish: input.currentFinish,
    proposedFinish: input.proposedFinish,
    sourceDelayId: input.sourceDelayId ?? null,
    sourceAssessmentImpactDays: input.sourceAssessmentImpactDays ?? null,
  };
  const unknown = (unknownReason: string): RecoveryComparison =>
    ({ ...known, workingDaysRecovered: null, verdict: 'UNKNOWN', unknownReason });

  if (!input.currentFinish || !DATE.test(input.currentFinish)) {
    return unknown('the programme has no current finish date to recover against');
  }
  if (!input.proposedFinish || !DATE.test(input.proposedFinish)) {
    return unknown('this proposal produced no finish date');
  }
  if (!input.established) {
    // A proposal with a known conflict or something unjudged may still be accepted — governed, not
    // blocked — but the days it claims to recover are not a figure to put in front of anybody.
    return unknown('this proposal is not established, so what it recovers cannot be stated');
  }

  const calendar = input.calendar ?? ALL_DAYS_WORKING;
  // Both directions counted the same way: the days BETWEEN the two finishes, exclusive of the
  // earlier one, so two identical finishes recover zero rather than one.
  const earlier = input.proposedFinish < input.currentFinish ? input.proposedFinish : input.currentFinish;
  const later = input.proposedFinish < input.currentFinish ? input.currentFinish : input.proposedFinish;
  const between = Math.max(0, workingDaysInRange(earlier, later, calendar).length - 1);
  // `between === 0` is normalised rather than negated: JavaScript's -0 is a real value that would
  // print as "-0 days recovered" and compare unequal to zero.
  const workingDaysRecovered = between === 0 ? 0 : input.proposedFinish < input.currentFinish ? between : -between;

  return {
    ...known,
    workingDaysRecovered,
    verdict: workingDaysRecovered > 0 ? 'RECOVERS_TIME' : workingDaysRecovered === 0 ? 'NO_CHANGE' : 'LOSES_TIME',
    unknownReason: null,
  };
}
