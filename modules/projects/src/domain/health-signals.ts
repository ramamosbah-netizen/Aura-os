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
 *   Engineering has seven status vocabularies — RFI, TQ, submittal, drawing, design change — and
 *   not one of them says which state blocks delivery. Is an open RFI a blocker? After how long? Is
 *   a rejected submittal worse than an unanswered TQ?
 *
 *   Procurement is the same shape. A `submitted` PR is awaiting approval, which is normal until it
 *   isn't, and nothing declares the threshold.
 *
 *   HSE does have a severity scale (`near_miss | minor | major | fatal`) — but severity is not the
 *   question. `major` + still investigating, `major` + closed, `near_miss` + open, `minor` with an
 *   overdue corrective action: those are HSE health semantics and HSE owns them. `fatal` reads
 *   obvious to a human, and that is precisely the temptation to refuse — allowing Projects one
 *   "obvious" exception is how it ends up deciding what a rejected submittal means tomorrow.
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
 * provider appears — `providerExpected` flips, a port gets bound, and the aggregation model,
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
  | 'engineering-blockers'
  | 'procurement-blockers';

export interface HealthSignalDeclaration {
  id: HealthSignalId;
  domain: HealthDomain;
  /**
   * Whether a provider SHOULD exist today.
   *
   * False means the owning domain has not declared its health semantics, so nothing is expected
   * and nothing is broken. True means one is expected — and if it is not bound, that is a
   * composition-root defect the runtime proof must catch, not a domain gap to shrug at.
   */
  providerExpected: boolean;
  /** Stated in the owning domain's terms, for the report a reader actually sees. */
  undeclaredReason?: string;
}

export const HEALTH_SIGNALS: readonly HealthSignalDeclaration[] = [
  // ── Owned by Projects. It may interpret its own facts, and only its own. ────────────────────
  { id: 'schedule-performance', domain: 'schedule', providerExpected: true },
  { id: 'delay-entitlement', domain: 'delay', providerExpected: true },
  { id: 'cost-performance', domain: 'cost', providerExpected: true },
  { id: 'commercial-exposure', domain: 'commercial', providerExpected: true },

  // ── Owned elsewhere, and answerable: these domains declare a severity of their own. ─────────
  { id: 'quality-ncr', domain: 'quality', providerExpected: true },
  { id: 'commissioning-readiness', domain: 'commissioning', providerExpected: true },

  // ── Owned elsewhere, and NOT yet answerable. Visible as partial coverage, never as clear. ───
  {
    id: 'hse-exposure',
    domain: 'hse',
    providerExpected: false,
    undeclaredReason:
      'HSE records incidents with a severity, but has not declared what they mean for project health. '
      + 'Whether an open major incident or an overdue corrective action is a project condition is HSE\'s to define.',
  },
  {
    id: 'engineering-blockers',
    domain: 'engineering',
    providerExpected: false,
    undeclaredReason:
      'Engineering has not declared which of its states block delivery. RFIs, technical queries and '
      + 'submittals each have their own status, and none of them says which one holds a project up.',
  },
  {
    id: 'procurement-blockers',
    domain: 'procurement',
    providerExpected: false,
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
