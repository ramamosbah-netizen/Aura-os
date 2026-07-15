// G5 — commercial stage gates + the Won/Lost invariants.
//
// Until now any stage dragged to any stage. A deal could reach `proposal` with nobody identified
// to propose to, or be marked `won` with no value and no reason — and the pipeline would report it
// as fact. "Stage change must not be a drag & drop with no rules" is the requirement; §40's
// invariants 3, 4 and 6 are the specific rules.
//
// The gate asks for EVIDENCE, not ceremony: every requirement below is something you would have to
// know anyway to honestly claim the stage. If a rule ever blocks work that is genuinely legitimate,
// the rule is wrong — that is why each gap is named and explained rather than a silent refusal.

import type { OpportunityStage } from './crm';

/**
 * Facts the gate needs but the Opportunity aggregate cannot see — quotations, tenders and
 * stakeholders live outside it. Passed IN by the composition layer, exactly like
 * LeadActivityFacts and OpportunityActivityFacts. Anything omitted is treated as UNKNOWN and
 * therefore NOT proven: the gate never invents evidence it was not given.
 */
export interface StageEvidence {
  /** Someone on the customer side is actually mapped to this deal. */
  hasStakeholder?: boolean;
  /** A quotation (or tender bid) exists for this opportunity. */
  hasQuotation?: boolean;
  /** That quotation actually went to the client — created ≠ submitted. */
  quotationSubmitted?: boolean;
}

export type StageGapCode =
  | 'NEED_NOT_CONFIRMED'
  | 'NO_STAKEHOLDER'
  | 'NO_PROPOSAL'
  | 'PROPOSAL_NOT_SUBMITTED'
  | 'NO_FINAL_VALUE'
  | 'NO_WIN_REASON'
  | 'NO_LOSS_REASON';

export interface StageGap {
  code: StageGapCode;
  /** What is missing, in the language of the person being stopped. */
  message: string;
}

export interface StageTransitionCheck {
  allowed: boolean;
  gaps: StageGap[];
}

/** The minimal opportunity shape the gate reads. */
export interface StageGateCandidate {
  stage: OpportunityStage;
  value: number;
  needConfirmed?: boolean;
  lossReason?: string | null;
  winReason?: string | null;
}

const gap = (code: StageGapCode, message: string): StageGap => ({ code, message });

const has = (s: string | null | undefined): boolean => Boolean(s && s.trim());

/**
 * What must be TRUE to enter `to`. Only forward commercial commitments are gated:
 *
 * - **proposal** — you cannot propose to nobody. Need confirmed + a stakeholder mapped.
 * - **negotiation** — you cannot negotiate a proposal you never sent. A submitted quotation.
 * - **won** — §40.3: a final value and the winning reason. A win with value 0 is not a win, and a
 *   win nobody can explain teaches the company nothing.
 * - **lost** — §40.4: the reason. This is the single most valuable field in the CRM and the one
 *   most often skipped, because by then everyone has moved on.
 *
 * NOT gated, deliberately:
 * - Moving BACKWARD (negotiation → proposal) — deals genuinely regress, and punishing honesty
 *   about that is how pipelines become fiction.
 * - Re-entering `qualification` — the starting state needs no evidence.
 * - Any transition where nothing changes.
 *
 * Evidence the caller does not supply counts as unproven, never as satisfied.
 */
export function checkStageTransition(
  opp: StageGateCandidate,
  to: OpportunityStage,
  evidence: StageEvidence = {},
): StageTransitionCheck {
  const gaps: StageGap[] = [];
  if (to === opp.stage) return { allowed: true, gaps };

  const order: OpportunityStage[] = ['qualification', 'proposal', 'negotiation'];
  const fromIdx = order.indexOf(opp.stage);
  const toIdx = order.indexOf(to);
  // A step back down the ladder is legitimate — only advancing needs evidence.
  const isRetreat = fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx;
  if (isRetreat) return { allowed: true, gaps };

  if (to === 'proposal') {
    if (!opp.needConfirmed) gaps.push(gap('NEED_NOT_CONFIRMED', 'Confirm the need before proposing — mark Need confirmed in qualification.'));
    if (!evidence.hasStakeholder) gaps.push(gap('NO_STAKEHOLDER', 'Map at least one stakeholder — you cannot propose to nobody.'));
  }

  if (to === 'negotiation') {
    if (!evidence.hasQuotation) gaps.push(gap('NO_PROPOSAL', 'Create the quotation first — there is nothing to negotiate yet.'));
    else if (!evidence.quotationSubmitted) gaps.push(gap('PROPOSAL_NOT_SUBMITTED', 'Send the quotation to the client — a draft is not a proposal.'));
  }

  if (to === 'won') {
    if (!(opp.value > 0)) gaps.push(gap('NO_FINAL_VALUE', 'Set the final commercial value — a win of 0 is not a win.'));
    if (!has(opp.winReason)) gaps.push(gap('NO_WIN_REASON', 'Record why we won — a win nobody can explain teaches the company nothing.'));
  }

  if (to === 'lost') {
    if (!has(opp.lossReason)) gaps.push(gap('NO_LOSS_REASON', 'Record why we lost — this is the most valuable field in the CRM.'));
  }

  return { allowed: gaps.length === 0, gaps };
}

/**
 * One sentence a human can act on — the 409 body and the UI both use it.
 *
 * The "only … can …" phrasing is not decoration: the API's error taxonomy classifies plain domain
 * errors BY MESSAGE, and that idiom is what marks a state-transition guard as 409 CONFLICT (the
 * request is well-formed; the aggregate's state forbids it). Wording it "cannot move to …" would
 * match the validation pattern and mis-report the same refusal as a 400 — the same class of
 * mis-classification the quotation pricing lock hit. The gaps then say what to actually do.
 */
export function stageGateMessage(to: OpportunityStage, gaps: StageGap[]): string {
  return `only an opportunity that meets the ${to} gate can move there — ${gaps.map((g) => g.message).join(' ')}`;
}
