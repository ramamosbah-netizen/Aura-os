import { PROJECT_STATES, type ProjectStatus } from './project';

/**
 * The project lifecycle, and what each transition is answerable for.
 *
 * WHAT WAS THERE
 *
 * Four states — planned, active, completed, cancelled — with a transition map and no gates. A
 * project became `active` with no scope structure, no costed work packages and no baseline, so
 * "in execution" meant only that someone had pressed a button. The audit's §2 finding was that
 * stages the business runs on (planning, testing, handover) are not states, and a transition
 * between things that are not states cannot carry a gate.
 *
 * WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * `planning`, `testing`, `handover` and `closeout` become real states. Award and Commercial
 * Handover are NOT: they happen before a project exists, and they belong to the deal chain — a
 * project inherits their outcome through `origin` and the handover snapshot, and duplicating them
 * as project states would create a second version of a truth Sales already owns.
 *
 *   planned → planning → active → testing → handover → closeout → completed
 *                            ↖───────────────┘  (a failed acceptance returns to delivery)
 *
 * `cancelled` remains reachable from anything not yet closed.
 *
 * MOBILIZATION IS NOT A LIFECYCLE STATE. That is a decision, not an omission.
 *
 * The business model lists mobilization as a phase, and it is one. But a lifecycle state has to be
 * ENTERABLE, EXITABLE and EVIDENCED, and mobilization is none of those in this system today.
 * Searched before deciding: it appears exactly twice, as a preliminaries cost line in tendering
 * (`estimate.ts` — "mobilization, supervision, site setup") and as a schedule activity named
 * "Mobilise". Neither is a fact about a project. There is no `mobilization_started_at`, no site
 * possession record, no readiness criteria, no access or resource prerequisites, no completion or
 * approval evidence — nothing anyone could query to answer "may this project leave mobilization?".
 *
 * A state whose gate can read nothing is worse than no state. It either passes always, which
 * teaches people the gate is theatre, or it blocks always, which teaches them to route around it.
 * Either way the system could ENTER the state without being able to say why it entered or when it
 * may leave. So mobilization is modelled where it already lives: as planned and executed work
 * inside Planning, with its own schedule activities and its own preliminaries cost.
 *
 * Stated as the decision, for anyone who comes to this asking where mobilization went:
 *
 *   Mobilization is not a Project lifecycle state in the current authority model. It is
 *   represented as planned/executed work within Planning. It may be promoted to a governed
 *   lifecycle state only when distinct queryable entry/exit facts and business gates exist.
 *
 * THE OLD NAMES ARE KEPT ON PURPOSE
 *
 * `planned`, `active` and `completed` still exist and still mean what they meant. Hundreds of call
 * sites and a free-text database column read those words; renaming them would be a rewrite with no
 * behavioural gain, and every row already stored would become a value nobody handles. The new
 * states sit between them:
 *
 *   planned    = the project exists, work has not been planned yet   (unchanged)
 *   planning   = scope and baseline are being established            (NEW — was folded into planned)
 *   active     = execution                                           (unchanged)
 *   testing    = systems under test and commissioning                (NEW — was folded into active)
 *   handover   = acceptance with the client                          (NEW — was folded into active)
 *   closeout   = final account and handover pack                     (NEW — was folded into active)
 *   completed  = closed                                              (unchanged)
 *
 * Existing rows keep their meaning without a data migration, and a project that never adopts the
 * new states still moves planned → active → completed exactly as before.
 *
 * SKIP REPRESENTATION, NEVER GOVERNANCE
 *
 * Keeping the old edges creates a trap: if `planned → active` were allowed to skip the conditions
 * that `planning → active` enforces, the old path would simply become the way to start an
 * unplanned project, and the gate would be decoration. So the rule this file is built around:
 *
 *   A compatibility edge may skip the intermediate STATES it never had. It may never skip the
 *   CONDITIONS those states carry.
 *
 * That is enforced structurally rather than by discipline. Conditions attach to the state being
 * ENTERED (`ENTRY` below), never to an edge, so two edges into the same state cannot demand
 * different things — there is one gate and both call it. Edges that reach a state without passing
 * through the ones between declare what they skip (`SKIPS` below), and the skipped states'
 * conditions are accumulated onto the move. Adding a condition to a state therefore adds it to
 * every path that reaches it, including the old ones, without anyone remembering to.
 */

/**
 * The states, re-exported from the domain type that owns them.
 *
 * Declared in `project.ts` so `ProjectStatus` and this machine are the same list by construction —
 * a state the row may hold is a state the machine knows, and there is no second place to add one.
 */
export { PROJECT_STATES };
export type ProjectLifecycleState = ProjectStatus;

/** What must be TRUE before a transition is allowed. Read from the domains that own each fact. */
export interface LifecycleFacts {
  /** Scope structure: work packages that exist, and how many carry a planned value. */
  wbsNodes: number;
  wbsCosted: number;
  /** An approved opening baseline — approver and time, not just a saved plan. */
  baselineApproved: boolean;
  /** Commissioning: how many systems exist and how many are signed off. */
  commissioningSystems: number;
  commissioningDone: number;
  /** The closeout verdict, when one has been assembled. Null when it could not be. */
  closeoutReady: boolean | null;
}

export interface TransitionGate {
  from: ProjectLifecycleState;
  to: ProjectLifecycleState;
  allowed: boolean;
  /** Why not. Empty when allowed. */
  gaps: string[];
}

/** The shape of the machine: which states can follow which. */
const NEXT: Record<ProjectLifecycleState, ProjectLifecycleState[]> = {
  // `planned → active` is the compatibility edge: the only transition existing rows and callers
  // know. It is kept, and it is NOT a shortcut — see SKIPS.
  planned: ['planning', 'active', 'cancelled'],
  planning: ['active', 'cancelled'],
  // `active → completed` is likewise kept so a project that never adopts the new states behaves
  // as before, and likewise accumulates what it skips.
  active: ['testing', 'closeout', 'completed', 'cancelled'],
  // A failed acceptance goes back to delivery rather than forward; that is the whole point of
  // having testing and handover as states.
  testing: ['handover', 'active', 'cancelled'],
  handover: ['closeout', 'active', 'cancelled'],
  closeout: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** The conditions for ENTERING a state. Keyed by destination, so no two edges can disagree. */
type EntryGate = (facts: LifecycleFacts) => string[];

/**
 * Entering execution. Called by `planning → active` and by the legacy `planned → active` alike —
 * not copied for each, CALLED by each, which is the only way the two stay identical over time.
 *
 * Execution against no plan is what the previous lifecycle allowed, and it is the reason earned
 * value could not be computed for most projects.
 */
const activationGate: EntryGate = (facts) => {
  const gaps: string[] = [];
  if (facts.wbsNodes === 0) gaps.push('No scope structure: the work has no packages to execute against');
  else if (facts.wbsCosted === 0) gaps.push('No package carries a planned value, so progress cannot earn anything');
  if (!facts.baselineApproved) gaps.push('No approved baseline: without one there is nothing to measure performance against');
  return gaps;
};

/** Entering testing: there has to be something registered to test. */
const commissioningRegistered: EntryGate = (facts) =>
  facts.commissioningSystems === 0 ? ['No systems are registered for commissioning'] : [];

/** Entering handover: every registered system signed off, and the count of what is left. */
const commissioningComplete: EntryGate = (facts) => {
  if (facts.commissioningSystems === 0) return ['No systems are registered for commissioning'];
  if (facts.commissioningDone >= facts.commissioningSystems) return [];
  const left = facts.commissioningSystems - facts.commissioningDone;
  return [`${left} of ${facts.commissioningSystems} system${facts.commissioningSystems === 1 ? '' : 's'} not commissioned`];
};

/**
 * Entering completion: the §27 verdict, reused rather than restated.
 *
 * Null is not a pass, for the same reason it is not a pass there: an unassessed project has not
 * been cleared, it has not been asked.
 */
const closeoutVerdict: EntryGate = (facts) =>
  facts.closeoutReady === null
    ? ['Closeout readiness could not be established, so completion cannot be authorised']
    : facts.closeoutReady
      ? []
      : ['Closeout is not ready — clear its blockers first'];

/**
 * Two states carry no entry conditions of their own, deliberately.
 *
 * `planning` is where the scope and baseline that `active` demands get BUILT; gating entry to it
 * on having them would make it unreachable. `closeout` is where the final account is assembled and
 * blockers are DISCOVERED; its conditions belong on the way out, and they are the §27 verdict.
 */
const ENTRY: Partial<Record<ProjectLifecycleState, EntryGate>> = {
  active: activationGate,
  testing: commissioningRegistered,
  handover: commissioningComplete,
  completed: closeoutVerdict,
};

/**
 * Edges that reach a state without passing through the ones between, and what they pass over.
 *
 * Every entry here is a decision that the move is legitimate — a compatibility path, or a project
 * shape that genuinely has no separate acceptance phase. Listing what it skips is what keeps it
 * governed: the skipped states' conditions are added to the move, so the short path demands
 * everything the long path would have demanded on the way.
 */
const SKIPS: Record<string, readonly ProjectLifecycleState[]> = {
  // Compatibility. `planning` has no entry conditions, so this accumulates nothing extra — but the
  // activation gate still applies, because it belongs to `active`, not to the edge.
  'planned>active': ['planning'],
  // A project with no formal acceptance phase may go straight to closeout — carrying the
  // commissioning evidence testing and handover would have required.
  'active>closeout': ['testing', 'handover'],
  // Compatibility: the whole of the original lifecycle's second half.
  'active>completed': ['testing', 'handover', 'closeout'],
};

export function isKnownState(value: string): value is ProjectLifecycleState {
  return (PROJECT_STATES as readonly string[]).includes(value);
}

/**
 * Everything a move must satisfy: the destination's own conditions plus those of every state it
 * skips. Exported so a test can assert that two edges demand the same thing, rather than asserting
 * one example and hoping.
 */
export function requiredFor(
  from: ProjectLifecycleState,
  to: ProjectLifecycleState,
  facts: LifecycleFacts,
): string[] {
  const through = SKIPS[`${from}>${to}`] ?? [];
  // Deduplicated: testing and handover both speak about unregistered systems, and a caller should
  // be told that once.
  return [...new Set([...through, to].flatMap((state) => ENTRY[state]?.(facts) ?? []))];
}

/**
 * Whether a transition is structurally possible AND its business conditions are met.
 *
 * Structure and conditions are separated deliberately: "you cannot go from completed to planning"
 * is a different sentence from "you cannot start execution without a baseline", and a caller shown
 * the second learns what to do while the first only tells them they were wrong.
 */
export function evaluateTransition(
  from: ProjectLifecycleState,
  to: ProjectLifecycleState,
  facts: LifecycleFacts,
): TransitionGate {
  if (!NEXT[from]?.includes(to)) {
    return { from, to, allowed: false, gaps: [`a project cannot move from ${from} to ${to}`] };
  }

  // Cancelling is always available while the project is live. A gate on abandonment would trap a
  // project that has to stop for reasons no checklist models. "Always allowed" is not "unaudited":
  // the service demands an actor and a non-empty reason and emits a governed event of its own —
  // see `ProjectService.cancel`.
  if (to === 'cancelled') return { from, to, allowed: true, gaps: [] };

  const gaps = requiredFor(from, to, facts);
  return { from, to, allowed: gaps.length === 0, gaps };
}

/** Every move available from here, with its verdict — what a UI needs to offer honest choices. */
export function availableTransitions(from: ProjectLifecycleState, facts: LifecycleFacts): TransitionGate[] {
  return (NEXT[from] ?? []).map((to) => evaluateTransition(from, to, facts));
}

/** Narrow the stored free-text status to a known state, defaulting to the original meaning. */
export function toLifecycleState(status: ProjectStatus | string): ProjectLifecycleState {
  return isKnownState(status) ? status : 'planned';
}
