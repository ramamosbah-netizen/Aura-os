/**
 * Cross-domain project health — §24.
 *
 * WHY THIS EXISTS
 *
 * Project 360 computed health from five signals, all of them project-module facts: baseline, CPI,
 * SPI, change and closeout. A project with three open critical NCRs and a reportable HSE incident
 * therefore read as fine, because nobody had asked Quality or HSE. The business model asks for a
 * cross-domain read — schedule, delay, cost, commercial, quality, HSE, engineering, procurement,
 * commissioning — and until this module existed, the facts were all there and unread.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It is an EXPLANATORY authority, not a gate. §2 decides whether a lifecycle transition is
 * allowed; §27 decides whether a closeout is allowed. This module answers a different question —
 * what is wrong, how serious, who owns it, and what could not be judged — and it must never
 * authorise or refuse anything.
 *
 * That separation is load-bearing rather than tidy. A third authority that re-interpreted NCRs,
 * HSE conditions and commissioning would eventually disagree with the gates that already read
 * them: health would say BLOCKED while the lifecycle gate said PASS, and nobody could say which
 * was right. Health may EXPLAIN why a gate is likely to refuse. It may not decide.
 *
 * It also holds no interpretation of its own. Each owning domain reports the state of its own
 * signal, in its own words, because only Quality knows what it means by "critical", only HSE knows
 * what it means by "reportable", and only Procurement knows what it means by "blocking". This
 * module aggregates those reports; it never re-derives them. `aura_hse_incidents` having rows
 * tells Projects nothing about which of them matter.
 *
 * TWO AXES, INDEPENDENT ON PURPOSE
 *
 * The existing `resolveAssessment` is a single precedence chain in which ATTENTION_REQUIRED
 * outranks UNABLE_TO_VERIFY. So a project with a critical finding AND an unreadable provider
 * reports "needs attention" and the unknown disappears from the headline. That is the one thing
 * this module must not inherit.
 *
 *   severity   CLEAR · WATCH · AT_RISK · CRITICAL   — the worst thing we could actually judge
 *   coverage   COMPLETE · PARTIAL                    — whether we could judge everything required
 *
 * They are computed from DISJOINT inputs, not by precedence, which is what makes them independent:
 * severity reads only the signals that returned a verdict, coverage reads only the ones that could
 * not. A known critical can never hide an unknown, and an unknown can never hide a known critical.
 *
 *   CLEAR    · COMPLETE   nothing found, everything asked      (the only reassuring combination)
 *   CLEAR    · PARTIAL    nothing found in what we could read
 *   WATCH    · COMPLETE   an early concern, fully evidenced
 *   AT_RISK  · PARTIAL    a known risk, and incomplete evidence
 *   CRITICAL · COMPLETE   a known critical condition
 *   CRITICAL · PARTIAL    a known critical condition, and incomplete evidence
 *
 * UNKNOWN IS NOT A SEVERITY
 *
 * It is deliberately absent from the ordering below. UNKNOWN is not worse than CRITICAL and not
 * better than CLEAR — it is the absence of the ability to judge, which is a statement about
 * evidence, not about the project. Ranking it would force exactly the collapse the two axes exist
 * to prevent.
 *
 * UNKNOWN IS NOT "DOES NOT APPLY"
 *
 * The distinction matters more than it looks:
 *
 *   UNKNOWN         we should have been able to judge this, and could not
 *   NOT_APPLICABLE  there was no judgement to make in the first place
 *
 * A supply-only project with no commissioning scope has nothing to commission. If that read as
 * UNKNOWN it would sit at PARTIAL coverage forever, and PARTIAL would come to mean "normal" —
 * which would make it useless on the day a provider genuinely fails. So NOT_APPLICABLE touches
 * neither axis: it is recorded, and it is not counted.
 *
 * WHY THIS LIVES IN `shared` AND NOT IN `projects`
 *
 * Every domain has to be able to phrase its own verdict, and under ADR-0004 no module may import
 * another — Quality importing `@aura/projects` to say "CRITICAL" is exactly the edge the
 * architecture fitness test refuses. So the vocabulary sits where `assessment-state` and
 * `project-assessment` already sit: shared, framework-free, owned by nobody.
 *
 * That placement is also the honest description of what this is. It is a language for domains to
 * report health in, not a thing Projects owns and lends out.
 */

/** The domains a project's health is answerable to. Each owns the meaning of its own signal. */
export type HealthDomain =
  | 'schedule'
  | 'delay'
  | 'cost'
  | 'commercial'
  | 'quality'
  | 'hse'
  | 'engineering'
  | 'procurement'
  | 'commissioning';

/**
 * How bad a signal is, when it could be judged at all.
 *
 * `CLEAR` rather than `HEALTHY`, deliberately and including at the API boundary. `HEALTHY` already
 * means "full coverage AND everything clean" in `AssessmentState`; reusing it for severity alone
 * would smuggle a completeness claim into an axis that makes none. CLEAR says only: nothing was
 * found in the facts we were able to assess.
 */
export type HealthSeverity = 'CLEAR' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

/** What one signal reports. The two non-severities are evidence statements, not rankings. */
export type HealthSignalState = HealthSeverity | 'UNKNOWN' | 'NOT_APPLICABLE';

/** Whether every signal that SHOULD have been judged was. */
export type HealthCoverage = 'COMPLETE' | 'PARTIAL';

/**
 * WHY a signal came back UNKNOWN. One state, three quite different situations.
 *
 * All three degrade coverage identically — that is the point of the axis — but they call for
 * entirely different responses, and collapsing them would hide which. "Engineering has not decided
 * what blocks delivery" is a conversation with Engineering; "the Quality provider threw" is an
 * incident; "nobody wired the provider" is a defect in the composition root. A single "no data"
 * would have all three read as the same shrug.
 */
export type HealthUnknownCause =
  /** The owning domain has not declared what its facts MEAN for project health. No provider is
   *  expected yet, so its absence is a known state rather than a fault. */
  | 'SEMANTICS_UNDECLARED'
  /** A provider exists, was asked, and could not answer. */
  | 'PROVIDER_UNAVAILABLE'
  /** A provider is expected and was never bound — a composition-root defect, not a domain gap. */
  | 'PROVIDER_UNBOUND';

/**
 * The severity ordering. UNKNOWN and NOT_APPLICABLE are absent by construction — they are not
 * points on this scale, so they cannot accidentally be compared against one.
 */
const RANK: Record<HealthSeverity, number> = { CLEAR: 0, WATCH: 1, AT_RISK: 2, CRITICAL: 3 };

const isSeverity = (state: HealthSignalState): state is HealthSeverity => state in RANK;

/**
 * One domain's report about one thing.
 *
 * `reason` and `href` come from the owning domain and are passed through untouched. This module
 * does not author them, because phrasing a domain's finding is the first step toward re-deciding
 * it.
 */
export interface HealthSignal {
  /**
   * Canonical identity for this signal — one problem, one id, across every view that shows it.
   *
   * Without it the same underlying fact projected by two modules reads as two independent
   * problems, and a project looks worse than it is.
   */
  id: string;
  domain: HealthDomain;
  state: HealthSignalState;
  /** The owning domain's own words for what is wrong. Absent when the state is CLEAR. */
  reason?: string;
  /**
   * Present only when `state` is UNKNOWN. Additive to the frozen aggregation — it changes no
   * verdict, it records why a verdict was impossible, so "the domain has not decided yet" is never
   * mistaken for "the provider is down".
   */
  cause?: HealthUnknownCause;
  /** Where the work that clears it lives. Never a Project 360 route: the owner is elsewhere. */
  href?: string;
  /** A count or value, where the domain has one worth showing. */
  measure?: { value: number; unit?: string };
}

export interface ProjectHealth {
  /** The worst thing that could actually be judged. Never inflated by what could not. */
  severity: HealthSeverity;
  /** Whether anything required was unreadable. Never suppressed by a known finding. */
  coverage: HealthCoverage;
  /** False when nothing applied to this project at all — distinct from "nothing was wrong". */
  applicable: boolean;
  /** The one combination that may be presented as reassurance. */
  reassuring: boolean;
  /** Everything reported, in the order given, including the unreadable and the inapplicable. */
  signals: HealthSignal[];
  /** The subset that raised something — worst first, so a caller can show the top concern. */
  concerns: HealthSignal[];
  /** Required, and unreadable. The reason coverage is PARTIAL. */
  unknown: HealthSignal[];
  /** No judgement was required. Recorded so the absence is visible, counted toward neither axis. */
  notApplicable: HealthSignal[];
}

/**
 * Aggregate one project's health from what each domain reported.
 *
 * Pure, and deliberately free of a clock: `assessedAt` belongs to the service that assembles the
 * readings, not to the rule that combines them, so this stays testable without one.
 */
export function assessProjectHealth(signals: readonly HealthSignal[]): ProjectHealth {
  const all = [...signals];
  const readable = all.filter((s) => isSeverity(s.state));
  const unknown = all.filter((s) => s.state === 'UNKNOWN');
  const notApplicable = all.filter((s) => s.state === 'NOT_APPLICABLE');

  // Max over the READABLE signals only. An empty set yields CLEAR — nothing was found, because
  // nothing could be looked at — and `coverage` is what says so.
  const severity = readable.reduce<HealthSeverity>(
    (worst, s) => (RANK[s.state as HealthSeverity] > RANK[worst] ? (s.state as HealthSeverity) : worst),
    'CLEAR',
  );

  // Computed from the unreadable set alone, never from severity. That disjointness IS the
  // independence of the two axes.
  const coverage: HealthCoverage = unknown.length > 0 ? 'PARTIAL' : 'COMPLETE';

  // Nothing to judge is not the same as nothing wrong. A project where every signal declined to
  // apply has not been given a clean bill of health; it has not been asked a question.
  const applicable = all.length > notApplicable.length;

  const concerns = readable
    .filter((s) => s.state !== 'CLEAR')
    .sort((a, b) => RANK[b.state as HealthSeverity] - RANK[a.state as HealthSeverity]);

  return {
    severity,
    coverage,
    applicable,
    // Reassurance needs all three: something was asked, nothing was found, and nothing was missed.
    reassuring: applicable && severity === 'CLEAR' && coverage === 'COMPLETE',
    signals: all,
    concerns,
    unknown,
    notApplicable,
  };
}
