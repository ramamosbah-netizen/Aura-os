import type { TenderStatus } from './tender';
import type { BidRecommendation } from './bid-score';

// T1 — tender lifecycle invariants (vision §2.2), the direct mirror of the CRM stage gate
// (shared/src/domain/stage-gate.ts). A pure function: it decides nothing about storage or events,
// it answers one question — "is this status transition allowed, and if not, why not?".
//
// The gate reads EVIDENCE (facts that live in sibling records — the bid score, the priced
// estimate), never flags stored on the tender. That is deliberate: there is one source of truth
// for "was this bid scored" (the BidScore) and one for "is it priced" (the RateBuildUp), and the
// gate composes them rather than keeping a second copy that could drift. Same discipline the CRM
// gate uses for quotations and stakeholders.
//
// Only ADVANCING needs evidence. A step back down the ladder is always legitimate (a mistake being
// corrected, a deal reopened), exactly as the CRM gate treats a retreat.

// `BidRecommendation` ('go' | 'conditional' | 'no_go') is the bid-score module's own type — the
// gate reuses it rather than declaring a second copy of the same three words.

/** The tender fields the gate reads — a minimal slice, so tests need no full aggregate. */
export interface TenderGateCandidate {
  status: TenderStatus;
  value: number;
}

/** Facts from outside the tender aggregate the gate needs. Supplied by the caller (the service),
 * derived from the bid score and the estimate — the gate never fetches anything itself. */
export interface TenderGateEvidence {
  /** The latest recorded Bid/No-Bid recommendation, or null when none has been made. */
  bidRecommendation?: BidRecommendation | null;
  /** True when at least one BOQ item carries a priced rate (sellingRate > 0). */
  hasPricedEstimate?: boolean;
}

export type TenderGap =
  | 'NO_BID_DECISION'
  | 'BID_IS_NO_GO'
  | 'DECLINE_WITHOUT_NO_GO'
  | 'NO_PRICED_ESTIMATE'
  | 'NO_BID_VALUE'
  | 'NOT_SUBMITTED';

export interface TenderGapDetail {
  code: TenderGap;
  /** A sentence a salesperson can act on — not a code dump. */
  message: string;
}

export interface TenderTransitionCheck {
  allowed: boolean;
  gaps: TenderGapDetail[];
}

/** The forward ladder. Outcomes (`won`/`lost`/`declined`) sit past the end and are reached through
 * their own gates, so they are intentionally NOT on it. */
const LADDER: readonly TenderStatus[] = ['draft', 'qualifying', 'estimating', 'priced', 'submitted'];

const gap = (code: TenderGap, message: string): TenderGapDetail => ({ code, message });

/**
 * Is moving `tender` to status `to` allowed? Pure — same inputs ⇒ same answer.
 */
export function checkTenderTransition(
  tender: TenderGateCandidate,
  to: TenderStatus,
  evidence: TenderGateEvidence = {},
): TenderTransitionCheck {
  const gaps: TenderGapDetail[] = [];
  if (to === tender.status) return { allowed: true, gaps };

  const fromIdx = LADDER.indexOf(tender.status);
  const toIdx = LADDER.indexOf(to);
  // A step back down the ladder is legitimate — only advancing needs evidence.
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) return { allowed: true, gaps };

  const bid = evidence.bidRecommendation ?? null;
  const committedToBid = bid === 'go' || bid === 'conditional';

  if (to === 'estimating') {
    if (bid === null) {
      gaps.push(gap('NO_BID_DECISION', 'Record the Bid/No-Bid decision first — you cannot estimate a tender you have not committed to bidding.'));
    } else if (bid === 'no_go') {
      gaps.push(gap('BID_IS_NO_GO', 'The bid decision is No-Go — decline the tender rather than estimating it.'));
    }
  }

  if (to === 'priced') {
    if (!evidence.hasPricedEstimate) {
      gaps.push(gap('NO_PRICED_ESTIMATE', 'Price at least one BOQ item — an estimate with no priced rate is not priced.'));
    }
  }

  if (to === 'submitted') {
    if (!committedToBid) {
      gaps.push(gap('NO_BID_DECISION', 'No Go/Conditional bid decision on record — you cannot submit a bid you never committed to.'));
    }
    if (!evidence.hasPricedEstimate) {
      gaps.push(gap('NO_PRICED_ESTIMATE', 'Nothing is priced — there is no bid to submit.'));
    }
    if (!(tender.value > 0)) {
      gaps.push(gap('NO_BID_VALUE', 'Set the bid value — a submission of 0 is not a bid.'));
    }
  }

  if (to === 'won' || to === 'lost') {
    // The submission is the milestone that makes a win or loss meaningful; T2 will add a proper
    // submission record, at which point this can read that instead of the state.
    if (tender.status !== 'submitted') {
      gaps.push(gap('NOT_SUBMITTED', 'Only a submitted bid can be won or lost — record the submission first.'));
    }
  }

  if (to === 'declined') {
    if (bid !== 'no_go') {
      gaps.push(gap('DECLINE_WITHOUT_NO_GO', 'Record a No-Go bid decision before declining — a decline with no rationale teaches the company nothing.'));
    }
  }

  return { allowed: gaps.length === 0, gaps };
}

/** Format a blocked transition as one throwable sentence. The "only … can move there" phrasing is
 * not cosmetic: it matches the API error taxonomy's state-transition class, so a gate violation is
 * a clean 409 Conflict (the request is well-formed; the tender's state forbids it) — exactly as the
 * CRM stage gate's message does. */
export function tenderGateMessage(to: TenderStatus, gaps: TenderGapDetail[]): string {
  const why = gaps.map((g) => g.message).join(' ');
  return `only a tender that meets the ${to} gate can move there — ${why}`;
}
