import type { Opportunity, AwardSource, AttentionFacts } from './crm';
import type { BuyingStage } from './buying-journey';
import type { Id } from './id';
import { resolveDealOutcome, type DealOutcomeState } from './opportunity-outcome';
import { qualificationFromFlags, type QualificationDimension } from './qualification-state';

/**
 * DealFacts — the factual snapshot Opportunity 360's deterministic rules read.
 *
 * Direction of derivation is one-way and must stay that way:
 *
 *   Raw data -> DealFacts -> Deterministic Rules -> Assessment/Findings -> UI
 *
 * It is built from the DOMAIN and its sources, never from what a panel wants to render. If a field
 * exists only because some card displays it, it does not belong here.
 *
 * FACTS ONLY. No scores, health states, readiness bands, gate decisions, attention findings,
 * recommendations or user-facing wording. Those are conclusions and belong to the rules layer.
 * Concretely: this may say an award source exists — it may not say the deal is healthy; it may
 * expose qualification STATES — it may not decide qualified/unqualified.
 *
 * The reason this exists: every 360 surface used to compose its own definitions, so they contradicted
 * each other (an awarded deal whose contracted value read 0, a closed deal reported "on track"). One
 * fact layer means a definition can only be wrong in one place.
 */

/**
 * How well AURA can know something. The four are deliberately distinct — collapsing them is what
 * makes a system claim more than it knows.
 *
 *   NOT_CAPTURED  there is no field or evidence mechanism for this at all
 *   UNKNOWN       the concept IS captured, but the value is not known
 *   KNOWN_ABSENT  verified absent
 *   KNOWN_PRESENT evidenced present
 */
export type Knowledge<T> =
  | { status: 'NOT_CAPTURED' }
  | { status: 'UNKNOWN' }
  | { status: 'KNOWN_ABSENT' }
  | { status: 'KNOWN_PRESENT'; value: T };

export const notCaptured = <T>(): Knowledge<T> => ({ status: 'NOT_CAPTURED' });
export const unknownFact = <T>(): Knowledge<T> => ({ status: 'UNKNOWN' });
export const knownAbsent = <T>(): Knowledge<T> => ({ status: 'KNOWN_ABSENT' });
export const knownPresent = <T>(value: T): Knowledge<T> => ({ status: 'KNOWN_PRESENT', value });

/**
 * Competitor knowledge. `KNOWN_NONE` is part of the vocabulary but is UNREACHABLE from today's data:
 * the opportunity stores a free-text `competitors` string, and a blank one cannot distinguish "there
 * are no competitors" from "nobody has asked". Absence therefore stays UNKNOWN. It becomes
 * constructible only when AURA gains a real way to record "no competitors".
 */
export type CompetitorState = 'UNKNOWN' | 'KNOWN_NONE' | 'KNOWN_PRESENT';
export interface CompetitorFacts {
  state: CompetitorState;
  items: string[];
}

export interface StakeholderFact {
  id: Id;
  name: string;
  role: string | null;
  influence: string | null;
  isPrimary: boolean;
  /** Presence of a channel — NOT a verdict on whether the person is reachable. */
  hasEmail: boolean;
  hasPhone: boolean;
}

export interface NextOpenActivityFact {
  subject: string;
  /** `null` = scheduled with no date. Not "overdue" — that judgement belongs to a rule. */
  dueDate: string | null;
  assigneeId: Id | null;
}

export interface DealFacts {
  lifecycle: {
    id: Id;
    title: string;
    stage: string;
    /**
     * DERIVED: the execution path actually taken (a linked tender, or executionType 'tender').
     * NOTE — this is NOT the same notion as `requiresTender` below, which is the raw intent flag.
     * The 360 controller derives `route` from `requiresTender` while this derives it from the
     * tender link; the two can disagree, and reconciling them is deliberately out of this slice.
     */
    route: 'tender' | 'direct';
    /** RAW persisted intent flag (`aura_crm_opportunities.requires_tender`). */
    requiresTender: boolean;
    tenderId: Id | null;
    ownerId: Id | null;
    expectedCloseDate: string | null;
  };
  outcome: {
    state: DealOutcomeState;
    terminal: boolean;
    won: boolean;
    awardDocumented: boolean;
    awardSource: AwardSource | null;
    awardedQuotationId: Id | null;
    awardedAt: string | null;
    lossReason: string | null;
    winReason: string | null;
  };
  qualification: {
    dimensions: QualificationDimension[];
    confirmed: number;
    unknown: number;
    concerns: number;
    blockers: number;
    /** CONFIRMED dimensions with no recorded evidence. A count, not a judgement. */
    unevidenced: number;
  };
  stakeholders: {
    people: StakeholderFact[];
    count: number;
  };
  commercial: {
    /** The salesperson's forecast figure. Deliberately NOT called `value`, and it feeds nothing. */
    headlineValue: number | null;
    /** `null` = this caller did not load requirements. NOT the same as "there are none". */
    requirementCount: number | null;
    scopeApprovedAt: string | null;
    estimateApprovedAt: string | null;
    pricingFrozenAt: string | null;
    /** Sum of linked quotation totals, INCLUDING VAT. `null` when no quotation exists. */
    quotedTotal: number | null;
    acceptedQuotationId: Id | null;
    /** The award figure, EXCLUDING VAT. `null` unless a documented award carries one. */
    awardValue: number | null;
  };
  strategy: {
    /** `null` = never assessed. Must not be collapsed into a stage. */
    customerBuyingStage: BuyingStage | null;
    competitors: CompetitorFacts;
  };
  engagement: {
    lastActivityAt: string | null;
    /** `null` = this caller did not count activities. NOT "there are none open". */
    openActivityCount: number | null;
    nextOpenActivity: NextOpenActivityFact | null;
    /**
     * The opportunity's own next-action COLUMNS — the fallback the Next-Action Invariant uses when
     * nothing is scheduled. Raw persisted: `aura_crm_opportunities.next_action` (mig 0145) and
     * `next_action_due_date` (mig 0155). `null` = the column is empty, a real absence.
     */
    plannedNextActionSubject: string | null;
    plannedNextActionDueDate: string | null;
  };
  /** What can be PROVEN about the award, as opposed to what the deal claims. */
  awardEvidence: {
    /** No storage exists for a customer PO/LOA anywhere in AURA — hence NOT_CAPTURED, not UNKNOWN. */
    customerPoOrLoa: Knowledge<{ reference: string }>;
  };
  downstream: {
    /** `value: null` when no contract exists. A contract worth 0 keeps its real 0. */
    contract: { exists: boolean; id: Id | null; value: number | null };
    project: { exists: boolean; id: Id | null };
  };
}

/** Minimal structural rows — shared cannot depend on the module packages. */
export interface QuotationRowFact { id: Id; total: number; status: string }
export interface ContractRowFact { id: Id; status: string; value: number }
export interface ProjectRowFact { id: Id }
export interface StakeholderRowFact {
  id: Id; name: string; stakeholderRole?: string | null; relationshipStrength?: string | null;
  isPrimary?: boolean; email?: string | null; phone?: string | null;
}

export interface DealFactsInput {
  opportunity: Opportunity;
  requirementCount?: number | null;
  stakeholders: readonly StakeholderRowFact[];
  /** Already filtered to this deal's provenance by the caller. */
  quotations: readonly QuotationRowFact[];
  contracts: readonly ContractRowFact[];
  projects: readonly ProjectRowFact[];
  governance?: { scopeApprovedAt?: string | null; estimateApprovedAt?: string | null; pricingFrozenAt?: string | null } | null;
  /**
   * Resolved by the caller with the EXISTING activity helper — passed in rather than re-derived, so
   * there is only ever one definition of "the next open activity".
   */
  engagement?: { lastActivityAt?: string | null; openActivityCount?: number; nextOpenActivity?: NextOpenActivityFact | null } | null;
}

const CANCELLED = 'cancelled';

/** Free text -> competitor facts. Blank stays UNKNOWN; it can never mean "no competitors". */
export function competitorsFromText(text: string | null | undefined): CompetitorFacts {
  const items = (text ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? { state: 'KNOWN_PRESENT', items } : { state: 'UNKNOWN', items: [] };
}

export function buildDealFacts(input: DealFactsInput): DealFacts {
  const o = input.opportunity;
  const outcome = resolveDealOutcome(o); // REUSED — award provenance is never re-derived here
  const q = qualificationFromFlags(o);

  const liveContracts = input.contracts.filter((c) => c.status !== CANCELLED);
  // Absence of a contract is NOT a contract worth zero. A real 0-value contract keeps its 0.
  const contractValue = liveContracts.length > 0 ? liveContracts.reduce((s, c) => s + c.value, 0) : null;
  // Same rule for quotations: no quote at all is null, a quote that totals 0 is 0.
  const quotedTotal = input.quotations.length > 0 ? input.quotations.reduce((s, x) => s + x.total, 0) : null;

  return {
    lifecycle: {
      id: o.id,
      title: o.title,
      stage: o.stage,
      route: o.tenderId || o.executionType === 'tender' ? 'tender' : 'direct',
      requiresTender: o.requiresTender === true,
      tenderId: o.tenderId ?? null,
      ownerId: o.ownerId ?? null,
      expectedCloseDate: o.closeDate ?? null,
    },
    outcome: {
      state: outcome.state,
      terminal: outcome.terminal,
      won: outcome.won,
      awardDocumented: outcome.awardDocumented,
      awardSource: outcome.awardSource,
      awardedQuotationId: outcome.awardedQuotationId,
      awardedAt: o.awardedAt ?? null,
      lossReason: o.lossReason ?? null,
      winReason: o.winReason ?? null,
    },
    qualification: {
      dimensions: q.dimensions,
      confirmed: q.confirmed,
      unknown: q.unknown,
      concerns: q.concerns,
      blockers: q.blockers,
      unevidenced: q.unevidenced,
      // NOTE: `band` is deliberately absent — a readiness label is a rule output, not a fact.
    },
    stakeholders: {
      people: input.stakeholders.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.stakeholderRole ?? null,
        influence: s.relationshipStrength ?? null,
        isPrimary: s.isPrimary === true,
        hasEmail: !!s.email?.trim(),
        hasPhone: !!s.phone?.trim(),
      })),
      count: input.stakeholders.length,
    },
    commercial: {
      headlineValue: o.value ?? null,
      requirementCount: input.requirementCount ?? null,
      scopeApprovedAt: input.governance?.scopeApprovedAt ?? null,
      estimateApprovedAt: input.governance?.estimateApprovedAt ?? null,
      pricingFrozenAt: input.governance?.pricingFrozenAt ?? null,
      quotedTotal,
      acceptedQuotationId: outcome.awardedQuotationId,
      awardValue: outcome.awardValue,
    },
    strategy: {
      customerBuyingStage: o.buyingStage ?? null,
      competitors: competitorsFromText(o.competitors),
    },
    engagement: {
      lastActivityAt: input.engagement?.lastActivityAt ?? null,
      openActivityCount: input.engagement?.openActivityCount ?? null,
      nextOpenActivity: input.engagement?.nextOpenActivity ?? null,
      plannedNextActionSubject: o.nextAction ?? null,
      plannedNextActionDueDate: o.nextActionDueDate ?? null,
    },
    awardEvidence: {
      // Not a lookup that came back empty — there is nowhere in AURA to record this today.
      customerPoOrLoa: notCaptured(),
    },
    downstream: {
      contract: {
        exists: liveContracts.length > 0,
        id: liveContracts[0]?.id ?? null,
        value: contractValue,
      },
      project: { exists: input.projects.length > 0, id: input.projects[0]?.id ?? null },
    },
  };
}

/**
 * DealFacts -> the Next-Action Invariant's input contract. An ADAPTER, not a second derivation:
 * the rule itself lives in crm.ts and is the only implementation.
 */
export const attentionFactsOf = (facts: DealFacts): AttentionFacts => ({
  stage: facts.lifecycle.stage,
  ownerId: facts.lifecycle.ownerId,
  activitySubject: facts.engagement.nextOpenActivity?.subject ?? null,
  activityDueDate: facts.engagement.nextOpenActivity?.dueDate ?? null,
  activityOwnerId: facts.engagement.nextOpenActivity?.assigneeId ?? null,
  plannedSubject: facts.engagement.plannedNextActionSubject,
  plannedDueDate: facts.engagement.plannedNextActionDueDate,
});
