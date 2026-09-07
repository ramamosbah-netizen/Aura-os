import type { AssessmentCheckCode, AssessmentInput } from './assessment-state';

/**
 * Project 360's rule layer — the same shape the deal layer already uses.
 *
 *   ProjectFacts -> rules -> FINDINGS -> coverage -> UI
 *
 * The client renders. It holds no threshold and decides no project question, for the reason the
 * deal layer states plainly: a rule that lives in a component is a rule nobody can test, and it
 * drifts from the one the server enforces.
 *
 * A project is answerable for four things, and each check is one of them:
 *
 *   PROJECT_BASELINE       is the work PLANNED — a scope structure exists and is costed
 *   COST_PERFORMANCE       is it performing against that plan, in money
 *   SCHEDULE_PERFORMANCE   ... and in time
 *   CHANGE_CONTROL         is change to the plan governed rather than absorbed silently
 *   CLOSEOUT_READINESS     can it be finished
 *
 * Coverage is declared, not inferred. A project with no EVM has NOT passed its cost check — it has
 * not taken it, and saying so is the difference between "nothing is wrong" and "we cannot tell".
 */

export type ProjectFindingCode =
  | 'NO_SCOPE_BASELINE'
  | 'SCOPE_NOT_COSTED'
  | 'COST_OVERRUN'
  | 'SCHEDULE_SLIPPING'
  | 'CHANGE_PENDING_DECISION'
  | 'DELAY_UNRESOLVED'
  | 'EOT_AWAITING_DECISION'
  | 'CLOSEOUT_INCOMPLETE'
  | 'READY_TO_CLOSE';

export interface ProjectFinding {
  code: ProjectFindingCode;
  /** Only what the wording needs; the client maps this to words, it does not compute from it. */
  data?: Record<string, unknown>;
}

/** Everything the rules read. Flat on purpose — see the deal layer's note about fact trees. */
export interface ProjectFacts {
  status: string;
  /** WBS nodes that exist, and how many carry a known planned value. */
  wbsNodes: number;
  wbsCosted: number;
  cbsNodes: number;
  /** EVM, null where the server could not compute it rather than zero. */
  cpi: number | null;
  spi: number | null;
  /** Change control. */
  variationsPending: number;
  delaysOpen: number;
  eotsAwaitingDecision: number;
  /** Closeout. */
  closeoutExists: boolean;
  closeoutItems: number;
  closeoutDone: number;
  closeoutFinalized: boolean;
}

/** A project past execution cannot be judged on how it is performing — only on how it ended. */
const TERMINAL = new Set(['completed', 'cancelled']);

export function evaluateProjectRules(f: ProjectFacts): ProjectFinding[] {
  const out: ProjectFinding[] = [];
  const terminal = TERMINAL.has(f.status);

  if (!terminal) {
    if (f.wbsNodes === 0) out.push({ code: 'NO_SCOPE_BASELINE' });
    else if (f.wbsCosted === 0) out.push({ code: 'SCOPE_NOT_COSTED', data: { nodes: f.wbsNodes } });

    // Below 1.0 means more was spent, or less was earned, than the plan allowed. The threshold is
    // the definition of the index, not a tuned number.
    if (f.cpi !== null && f.cpi < 1) out.push({ code: 'COST_OVERRUN', data: { cpi: f.cpi } });
    if (f.spi !== null && f.spi < 1) out.push({ code: 'SCHEDULE_SLIPPING', data: { spi: f.spi } });

    if (f.variationsPending > 0) out.push({ code: 'CHANGE_PENDING_DECISION', data: { count: f.variationsPending } });
    if (f.delaysOpen > 0) out.push({ code: 'DELAY_UNRESOLVED', data: { count: f.delaysOpen } });
    if (f.eotsAwaitingDecision > 0) out.push({ code: 'EOT_AWAITING_DECISION', data: { count: f.eotsAwaitingDecision } });
  }

  if (f.closeoutExists && !f.closeoutFinalized) {
    const remaining = f.closeoutItems - f.closeoutDone;
    if (remaining > 0) out.push({ code: 'CLOSEOUT_INCOMPLETE', data: { remaining, total: f.closeoutItems } });
    else if (f.closeoutItems > 0) out.push({ code: 'READY_TO_CLOSE', data: { total: f.closeoutItems } });
  }

  return out;
}

/** Findings that are information rather than a demand on someone's time. */
const INFORMATIONAL = new Set<ProjectFindingCode>(['READY_TO_CLOSE']);

export interface ProjectAssessment {
  findings: ProjectFinding[];
  coverage: AssessmentInput;
  needsAttention: boolean;
}

export function assessProject(findings: readonly ProjectFinding[], facts: ProjectFacts): ProjectAssessment {
  const terminal = TERMINAL.has(facts.status);

  // What this rule set can speak to at all. A finished project is not judged on how it is
  // performing — those questions no longer have an answer, and pretending they passed would be
  // the same collapse the deal layer was written to stop.
  const required: AssessmentCheckCode[] = terminal
    ? ['CLOSEOUT_READINESS']
    : ['PROJECT_BASELINE', 'COST_PERFORMANCE', 'SCHEDULE_PERFORMANCE', 'CHANGE_CONTROL', 'CLOSEOUT_READINESS'];

  const assessed: AssessmentCheckCode[] = [];
  const unverifiable: AssessmentCheckCode[] = [];

  if (!terminal) {
    // The baseline check runs whenever the scope structure could be read at all.
    assessed.push('PROJECT_BASELINE');

    // EVM is the ONLY source for these two. Null is not a pass — the server could not compute it,
    // usually because nothing is costed or no progress has been recorded.
    if (facts.cpi !== null) assessed.push('COST_PERFORMANCE');
    else unverifiable.push('COST_PERFORMANCE');
    if (facts.spi !== null) assessed.push('SCHEDULE_PERFORMANCE');
    else unverifiable.push('SCHEDULE_PERFORMANCE');

    assessed.push('CHANGE_CONTROL');
  }

  // Closeout can only be assessed once one exists. A project with no closeout record has not
  // passed the check; nobody has started it.
  if (facts.closeoutExists) assessed.push('CLOSEOUT_READINESS');
  else unverifiable.push('CLOSEOUT_READINESS');

  const attentionCount = findings.filter((f) => !INFORMATIONAL.has(f.code)).length;

  return {
    findings: [...findings],
    coverage: { attentionCount, required, assessed, unverifiable, applicable: true },
    needsAttention: attentionCount > 0,
  };
}
