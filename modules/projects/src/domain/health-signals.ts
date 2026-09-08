import type { HealthDomain, HealthSignal, HealthUnknownCause } from '@aura/shared';

/**
 * WHAT A PROJECT'S HEALTH IS ANSWERABLE TO — declared, not discovered.
 *
 * The registry exists so that a missing answer is a DETECTABLE state rather than a silent absence.
 * If health were assembled from whatever providers happened to be bound, a domain nobody wired
 * would simply not appear, the project would report CLEAR · COMPLETE, and the omission would be
 * invisible — which is the exact failure this whole module was built to end.
 *
 * So every signal is declared here whether or not anything can answer it yet. A signal with no
 * provider becomes UNKNOWN, which makes coverage PARTIAL, which stops Project 360 claiming a clean
 * bill of health it has not earned.
 *
 * WHY THREE DOMAINS ANSWER NOTHING YET
 *
 * HSE, Engineering and Procurement have data. What they do not have is a declared meaning for it,
 * and those are different problems:
 *
 *   Engineering turned out not to be one signal at all. A technical query declares `timeImpact` for
 *   itself and a drawing submission carries an agreed due date — both are evidence. RFIs and
 *   submittals carry a status and nothing else, at the schema as well as the model. So it is split:
 *   what Engineering can prove is reported, what it cannot is reported as unproven, and neither is
 *   allowed to stand in for the other.
 *
 *   Procurement is the same shape. A `submitted` PR is awaiting approval, which is normal until it
 *   isn't, and nothing declares the threshold.
 *
 *   HSE has now declared its own, in `hse.service.ts`: a fatal or major incident still open is
 *   critical, an overdue corrective action is at risk, anything else open is worth watching. It sat
 *   undeclared here for a while precisely BECAUSE `fatal` reads obvious to a human — and that
 *   obviousness is the temptation. One "obvious" exception taken by Projects is how it ends up
 *   deciding what a rejected submittal means next week. The rules live where the people who own
 *   them can change them.
 *
 * The rule that produced this list, stated once: PROJECTS DOES NOT DECIDE WHAT ANOTHER DOMAIN'S
 * VOCABULARY MEANS. A domain with facts but no declared semantics is not a domain Projects may
 * interpret on its behalf; it is a domain whose contract does not exist yet, and the honest report
 * of that is UNKNOWN.
 *
 * NOT A PLACEHOLDER ADAPTER
 *
 * There is deliberately no stub provider inside Projects returning UNKNOWN. The CONTRACT carries
 * the unavailability, so when Engineering declares its rules the only thing that changes is that a
 * provider appears — `semanticsDeclared` flips, a port gets bound, and the aggregation model,
 * the vocabulary and every consumer stay exactly as they are.
 */

/** Every signal, by canonical id. One problem, one id, across every view that shows it. */
export type HealthSignalId =
  | 'schedule-performance'
  | 'delay-entitlement'
  | 'cost-performance'
  | 'commercial-exposure'
  | 'quality-ncr'
  | 'commissioning-readiness'
  | 'hse-exposure'
  | 'engineering-delivery-impact'
  | 'engineering-approval-readiness'
  | 'procurement-blockers';

export interface HealthSignalDeclaration {
  id: HealthSignalId;
  domain: HealthDomain;
  /**
   * Whether the owning domain has declared what its facts MEAN for project health.
   *
   * Renamed from `providerExpected`, which read like a switch for skipping a signal. It never was
   * one and must never become one: BOTH values leave the signal in the assessment. True means a
   * provider exists and must be bound — an unbound one is a composition defect the runtime proof
   * catches. False means the domain has not decided yet, so the signal reports UNKNOWN and drags
   * coverage to PARTIAL.
   *
   * Neither value removes a signal from the report. A signal that genuinely does not apply to a
   * particular project is NOT_APPLICABLE returned by its provider at RUNTIME — a per-project fact,
   * the way Commissioning already answers for a project with nothing to commission. It is never a
   * registry flag, because a flag would apply to every project at once and could not be evidenced
   * for any of them.
   */
  semanticsDeclared: boolean;
  /** Stated in the owning domain's terms, for the report a reader actually sees. */
  undeclaredReason?: string;
}

export const HEALTH_SIGNALS: readonly HealthSignalDeclaration[] = [
  // ── Owned by Projects. It may interpret its own facts, and only its own. ────────────────────
  { id: 'schedule-performance', domain: 'schedule', semanticsDeclared: true },
  { id: 'delay-entitlement', domain: 'delay', semanticsDeclared: true },
  { id: 'cost-performance', domain: 'cost', semanticsDeclared: true },
  { id: 'commercial-exposure', domain: 'commercial', semanticsDeclared: true },

  // ── Owned elsewhere, and answerable: these domains have declared their own semantics. ───────
  { id: 'quality-ncr', domain: 'quality', semanticsDeclared: true },
  { id: 'commissioning-readiness', domain: 'commissioning', semanticsDeclared: true },
  { id: 'hse-exposure', domain: 'hse', semanticsDeclared: true },

  // ── Engineering, split in two because discovery proved it is not one thing. ─────────────────
  //
  // Two of its six record types carry evidence that a state threatens delivery; four carry none.
  // Answering as a single signal would have forced a choice between hiding a declared time impact
  // and reporting CLEAR for a project with forty unassessed open RFIs. Splitting keeps both true.
  { id: 'engineering-delivery-impact', domain: 'engineering', semanticsDeclared: true },
  {
    id: 'engineering-approval-readiness',
    domain: 'engineering',
    semanticsDeclared: false,
    undeclaredReason:
      'Engineering cannot yet say whether its approvals are on time. RFIs and submittals carry a status '
      + 'and nothing else — no due date, no priority, no reference to the work they hold up — and a drawing '
      + 'review is only measurable when someone agreed a date for it.',
  },

  // ── Owned elsewhere, and NOT yet answerable. Visible as partial coverage, never as clear. ───
  {
    id: 'procurement-blockers',
    domain: 'procurement',
    semanticsDeclared: false,
    undeclaredReason:
      'Procurement has not declared which of its states block delivery. A submitted request awaiting '
      + 'approval is routine until it is late, and no threshold for that exists yet.',
  },
];

/**
 * The UNKNOWN report for a signal nothing could answer.
 *
 * Kept here rather than at each call site so the three causes are phrased once and cannot drift
 * into three slightly different shrugs.
 */
export function unknownSignal(
  declaration: HealthSignalDeclaration,
  cause: HealthUnknownCause,
  detail?: string,
): HealthSignal {
  const reason =
    cause === 'SEMANTICS_UNDECLARED'
      ? declaration.undeclaredReason
        ?? `${declaration.domain} has not declared what its facts mean for project health.`
      : cause === 'PROVIDER_UNBOUND'
        ? `The ${declaration.domain} health provider is expected but was never bound, so this could not be assessed. `
          + 'That is a wiring defect, not a missing record.'
        : `${declaration.domain} could not be read${detail ? `: ${detail}` : ''}, so this could not be assessed.`;
  return { id: declaration.id, domain: declaration.domain, state: 'UNKNOWN', cause, reason };
}
