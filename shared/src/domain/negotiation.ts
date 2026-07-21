import { type Id, newId } from './id';

// Negotiation — what was asked, what was answered, and what it cost.
//
// The stage already existed (`under_negotiation`) and price movement was already recoverable
// from the revision chain: each revision is a full quotation with its own total and a
// parentQuotationId, so a discount is computable rather than asserted. What had no home
// anywhere was the ASK and the ANSWER — "they want 8% off", "we held at 3%", "the competitor
// quoted 1.42M". Those are the facts a commercial manager decides on, and they were living in
// people's inboxes.
//
// This is a LOG, not a state machine. A negotiation is a sequence of positions, and collapsing
// it into a single current status would throw away the shape of the conversation — which is
// precisely what tells you whether to hold or move.

export type NegotiationEntryType =
  /** The customer asked for a reduction. */
  | 'DISCOUNT_REQUESTED'
  /** We answered with a number. */
  | 'COUNTER_OFFERED'
  /** We declined to move, and why. */
  | 'POSITION_HELD'
  /** Something the customer said that bears on price or scope. */
  | 'CUSTOMER_COMMENT'
  /** A competitor's price or position, and where it came from. */
  | 'COMPETITOR_NOTED'
  /** Scope moved instead of price — the discount nobody records as one. */
  | 'SCOPE_CHANGED';

export const NEGOTIATION_ENTRY_TYPES: readonly NegotiationEntryType[] = [
  'DISCOUNT_REQUESTED', 'COUNTER_OFFERED', 'POSITION_HELD',
  'CUSTOMER_COMMENT', 'COMPETITOR_NOTED', 'SCOPE_CHANGED',
];

/** Who moved. A negotiation has two sides and a log that cannot tell them apart is not a log. */
export type NegotiationParty = 'CUSTOMER' | 'US' | 'COMPETITOR';

export interface NegotiationEntry {
  id: Id;
  tenantId: Id;
  /** The quotation being negotiated. */
  quotationId: Id;
  type: NegotiationEntryType;
  party: NegotiationParty;
  /**
   * The money on the table, when there is a number. A discount request carries the amount asked
   * FOR (not the resulting total); a counter-offer carries what we offered; a competitor note
   * carries their price. Null when the entry is qualitative.
   */
  amount: number | null;
  /** Percent, when the ask was expressed that way. Both may be set; neither is derived from the other. */
  percent: number | null;
  note: string;
  recordedBy: Id | null;
  occurredAt: string;
  createdAt: string;
}

export interface NewNegotiationEntry {
  tenantId: Id;
  quotationId: Id;
  type: NegotiationEntryType;
  party?: NegotiationParty;
  amount?: number | null;
  percent?: number | null;
  note: string;
  recordedBy?: Id | null;
  occurredAt?: string;
}

/** Who is presumed to be moving, when the caller does not say. */
const DEFAULT_PARTY: Record<NegotiationEntryType, NegotiationParty> = {
  DISCOUNT_REQUESTED: 'CUSTOMER',
  CUSTOMER_COMMENT: 'CUSTOMER',
  COUNTER_OFFERED: 'US',
  POSITION_HELD: 'US',
  SCOPE_CHANGED: 'US',
  COMPETITOR_NOTED: 'COMPETITOR',
};

export function makeNegotiationEntry(input: NewNegotiationEntry, now = new Date()): NegotiationEntry {
  if (!input.note?.trim()) throw new Error('a negotiation entry needs a note');
  if (input.amount !== undefined && input.amount !== null && input.amount < 0) {
    throw new Error('amount cannot be negative');
  }
  if (input.percent !== undefined && input.percent !== null && (input.percent < 0 || input.percent > 100)) {
    throw new Error('percent must be between 0 and 100');
  }
  const iso = now.toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    quotationId: input.quotationId,
    type: input.type,
    party: input.party ?? DEFAULT_PARTY[input.type],
    amount: input.amount ?? null,
    percent: input.percent ?? null,
    note: input.note.trim(),
    recordedBy: input.recordedBy ?? null,
    occurredAt: input.occurredAt ?? iso,
    createdAt: iso,
  };
}

/** One revision, reduced to what a negotiation cares about: what the price did. */
export interface PriceMove {
  revision: number;
  total: number;
  /** Change from the previous revision. Negative is a concession. */
  delta: number;
  at: string;
}

export interface NegotiationSummary {
  entries: number;
  /** The largest discount the customer asked for, in percent, if any was expressed that way. */
  largestAskPercent: number | null;
  /** What the price actually moved, first revision to last. Negative is a concession. */
  priceMovement: number;
  /** Concession as a percent of the opening price. Positive number = how much we gave away. */
  concessionPercent: number;
  /** Competitor prices recorded, lowest first — what we are actually being measured against. */
  competitorPrices: number[];
  /** True when the customer asked and nothing has answered them yet. */
  awaitingOurAnswer: boolean;
}

/**
 * Summarise a negotiation from its log and its revision chain.
 *
 * Price movement is COMPUTED from revisions, never from what anyone claimed in a note. A note
 * saying "gave them 5%" and a revision chain showing 2% disagree, and the revision chain is the
 * one that bills.
 */
export function summariseNegotiation(entries: NegotiationEntry[], moves: PriceMove[]): NegotiationSummary {
  const ordered = [...entries].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const asks = ordered.filter((e) => e.type === 'DISCOUNT_REQUESTED' && e.percent !== null);
  const opening = moves.length > 0 ? moves[0].total : 0;
  const closing = moves.length > 0 ? moves[moves.length - 1].total : 0;
  const movement = closing - opening;

  // The last thing said, by whom — an ask with no answer after it is the open question.
  const lastMeaningful = [...ordered].reverse().find((e) =>
    e.type === 'DISCOUNT_REQUESTED' || e.type === 'COUNTER_OFFERED' || e.type === 'POSITION_HELD',
  );

  return {
    entries: ordered.length,
    largestAskPercent: asks.length > 0 ? Math.max(...asks.map((e) => e.percent as number)) : null,
    priceMovement: movement,
    concessionPercent: opening > 0 ? Math.round((-movement / opening) * 1000) / 10 : 0,
    competitorPrices: ordered
      .filter((e) => e.type === 'COMPETITOR_NOTED' && e.amount !== null)
      .map((e) => e.amount as number)
      .sort((a, b) => a - b),
    awaitingOurAnswer: lastMeaningful?.type === 'DISCOUNT_REQUESTED',
  };
}
