import { sumMoney } from '@aura/shared';

/**
 * THE EXECUTIVE DECISION SET (F-10 / MGT-01…MGT-15) — what a CEO decides on, each answered from the
 * canonical records that own it, never from a projection of an event stream.
 *
 * The view this replaces read an in-memory fold of the LAST 5,000 events: past that, every figure was
 * silently partial. It showed "Active Contract Volume" as every contract AND every project ever
 * created, added together (each award counted twice, nothing ever removed); a "win rate" of contracts
 * created divided by tenders created; money in `$`; and no figure said when it was read, what it
 * counted, or where it came from.
 *
 * Every decision here carries:
 *   asOf        when it was read (all decisions in one view are read in one pass, at one time)
 *   population  how many records it counted, what they are, and what was LEFT OUT and why — a foreign-
 *               currency order that cannot be summed with AED ones is an exclusion, not a quiet zero
 *   source      the canonical store or authority it was read from
 *   records     the exact rows behind the figure — the drilldown is the same computation as the tile,
 *               so the two can never disagree
 *
 * A decision with no trustworthy source is shown as UNAVAILABLE with the reason. That is part of
 * covering the set: an executive told "this cannot be measured yet, because…" decides differently
 * from one shown a number that was never true.
 */

export const EXECUTIVE_DECISIONS = [
  { id: 'pipeline', capability: 'MGT-01', title: 'Pipeline quality and conversion', question: 'What is in the pipeline, and how much of what we decide do we win?' },
  { id: 'backlog', capability: 'MGT-02', title: 'Awarded backlog', question: 'How much awarded work is still to be billed?' },
  { id: 'project-health', capability: 'MGT-03', title: 'Project health', question: 'Which live projects are at risk, and where can we not tell?' },
  { id: 'schedule', capability: 'MGT-04', title: 'Schedule performance', question: 'Which activities now finish later than their baseline?' },
  { id: 'resources', capability: 'MGT-05', title: 'Resource utilisation', question: 'Are committed people and equipment actually available?' },
  { id: 'procurement', capability: 'MGT-06', title: 'Procurement exposure', question: 'What have we committed to suppliers that has not yet arrived?' },
  { id: 'revenue', capability: 'MGT-07', title: 'Revenue recognition', question: 'What revenue have we earned, and how far is billing ahead or behind it?' },
  { id: 'cost', capability: 'MGT-08', title: 'Cost and commitments', question: 'What have projects spent, and what is committed but not yet spent?' },
  { id: 'margin', capability: 'MGT-09', title: 'Margin and forecast', question: 'What margin are projects heading for, and which will lose money?' },
  { id: 'cash', capability: 'MGT-10', title: 'Cash and receivables', question: 'What are customers owing us, and how much of it is late?' },
  { id: 'risks', capability: 'MGT-11', title: 'Major risks and issues', question: 'Which high risks and serious issues are open?' },
  { id: 'variations', capability: 'MGT-12', title: 'Variations and claims', question: 'What change and time claims are waiting for a decision?' },
  { id: 'forecast', capability: 'MGT-13', title: 'Forecast completion', question: 'Which projects are heading past their baselined finish?' },
  { id: 'closeout', capability: 'MGT-14', title: 'Closeout exposure', question: 'What is stopping projects in handover and closeout from closing?' },
] as const;

export type DecisionId = (typeof EXECUTIVE_DECISIONS)[number]['id'];
export type DecisionMeta = (typeof EXECUTIVE_DECISIONS)[number];

export interface DecisionFigure {
  label: string;
  value: number;
  unit: 'currency' | 'count' | 'percent' | 'days';
}

/**
 * What a record's value measures. Rows behind one decision need not share it — the variations list
 * carries variations (money) and time claims (days) side by side — so each row states its own.
 */
export type RecordUnit = DecisionFigure['unit'] | 'quantity';

/** One row behind a figure, with the page that holds it. */
export interface DecisionRecord {
  id: string;
  label: string;
  href: string;
  /** The row's own measure, in `unit`. Null when the row is counted, not measured (a risk, an issue). */
  value: number | null;
  unit: RecordUnit | null;
  status: string | null;
  note: string | null;
}

export interface DecisionExclusion {
  count: number;
  reason: string;
}

export interface ExecutiveDecision {
  id: DecisionId;
  capability: string;
  title: string;
  question: string;
  state: 'measured' | 'unavailable';
  /** The first figure is the headline. Empty when unavailable. */
  figures: DecisionFigure[];
  population: { counted: number; of: string; excluded: DecisionExclusion[] };
  source: string;
  /** What the figure rests on and what it does not claim — read with the number, never instead of it. */
  basis: string | null;
  unavailableReason: string | null;
  asOf: string;
  records: DecisionRecord[];
}

export type DecisionSummary = Omit<ExecutiveDecision, 'records'> & { recordCount: number };

/** The drilldown: one decision, its records, and the currency its money is in (the same as the view's). */
export type ExecutiveDecisionDetail = ExecutiveDecision & { currency: string };

export interface ExecutiveDecisionsView {
  asOf: string;
  /** The currency every money figure is in. See CC-06 — base currency is company configuration to come. */
  currency: string;
  decisions: DecisionSummary[];
}

export function summarise(decision: ExecutiveDecision): DecisionSummary {
  const { records, ...rest } = decision;
  return { ...rest, recordCount: records.length };
}

export function metaOf(id: string): DecisionMeta | undefined {
  return EXECUTIVE_DECISIONS.find((d) => d.id === id);
}

export function measured(
  meta: DecisionMeta,
  asOf: string,
  input: { figures: DecisionFigure[]; records: DecisionRecord[]; of: string; excluded?: DecisionExclusion[]; source: string; basis?: string | null },
): ExecutiveDecision {
  return {
    id: meta.id, capability: meta.capability, title: meta.title, question: meta.question,
    state: 'measured',
    figures: input.figures,
    population: { counted: input.records.length, of: input.of, excluded: (input.excluded ?? []).filter((e) => e.count > 0) },
    source: input.source,
    basis: input.basis ?? null,
    unavailableReason: null,
    asOf,
    records: input.records,
  };
}

export function unavailable(meta: DecisionMeta, asOf: string, reason: string, source: string): ExecutiveDecision {
  return {
    id: meta.id, capability: meta.capability, title: meta.title, question: meta.question,
    state: 'unavailable', figures: [], population: { counted: 0, of: 'nothing — see the reason', excluded: [] },
    source, basis: null, unavailableReason: reason, asOf, records: [],
  };
}

/** Exact money sum, rounded once — the shared policy, not a float accumulation. */
export const sum = (values: number[]): number => Number(sumMoney(values));

/** Is this amount in the view's base currency? A record that never named one predates multi-currency and is read as base. */
export function inBase(currency: string | null | undefined, base: string): boolean {
  return !currency || currency.toUpperCase() === base;
}
