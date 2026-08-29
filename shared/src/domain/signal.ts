import { type Id, newId } from './id';

// A **Signal** is a pre-lead commercial possibility: "something happened that may deserve
// investigation." Not every signal becomes a Lead — the Opportunity Radar is where signals are
// triaged (reviewed / researched) and either PROMOTED to a Lead (preserving source attribution)
// or DISMISSED. Framework-free; the head of the acquisition chain: Signal → Lead → Opportunity.

export type SignalSource =
  | 'INBOUND' | 'MARKET' | 'RELATIONSHIP' | 'ACCOUNT_GROWTH' | 'CONTRACT_LIFECYCLE'
  | 'PROJECT_LIFECYCLE' | 'TENDER_DISCOVERY' | 'REFERRAL' | 'INTELLIGENCE' | 'MANUAL' | 'INTEGRATION';

export type SignalType =
  | 'NEW_PROJECT' | 'RFQ_RECEIVED' | 'TENDER_DETECTED' | 'RENEWAL_DUE' | 'AMC_EXPIRY'
  | 'WARRANTY_EXPIRY' | 'CROSS_SELL' | 'UPSELL' | 'EXPANSION' | 'DORMANT_ACCOUNT'
  | 'LOST_OPPORTUNITY_RECYCLE' | 'REFERRAL' | 'MARKET_EVENT' | 'OTHER';

export type SignalStatus = 'NEW' | 'REVIEWING' | 'RESEARCHING' | 'PROMOTED' | 'DISMISSED' | 'DUPLICATE';

export const SIGNAL_SOURCES: readonly SignalSource[] = [
  'INBOUND', 'MARKET', 'RELATIONSHIP', 'ACCOUNT_GROWTH', 'CONTRACT_LIFECYCLE',
  'PROJECT_LIFECYCLE', 'TENDER_DISCOVERY', 'REFERRAL', 'INTELLIGENCE', 'MANUAL', 'INTEGRATION',
];
export const SIGNAL_TYPES: readonly SignalType[] = [
  'NEW_PROJECT', 'RFQ_RECEIVED', 'TENDER_DETECTED', 'RENEWAL_DUE', 'AMC_EXPIRY',
  'WARRANTY_EXPIRY', 'CROSS_SELL', 'UPSELL', 'EXPANSION', 'DORMANT_ACCOUNT',
  'LOST_OPPORTUNITY_RECYCLE', 'REFERRAL', 'MARKET_EVENT', 'OTHER',
];
export const SIGNAL_STATUSES: readonly SignalStatus[] = [
  'NEW', 'REVIEWING', 'RESEARCHING', 'PROMOTED', 'DISMISSED', 'DUPLICATE',
];

/** Statuses where a signal is still on the radar awaiting a triage decision. */
export const SIGNAL_OPEN_STATUSES: readonly SignalStatus[] = ['NEW', 'REVIEWING', 'RESEARCHING'];
/** Terminal statuses — off the radar. */
export const SIGNAL_TERMINAL_STATUSES: readonly SignalStatus[] = ['PROMOTED', 'DISMISSED', 'DUPLICATE'];

/** Controlled business reasons for taking a signal off the radar. DUPLICATE is deliberately
 * represented separately from ordinary dismissal in the lifecycle and audit trail. */
export const SIGNAL_DISMISS_REASON_CODES = [
  'NOT_RELEVANT', 'EXISTING_OPPORTUNITY', 'LOW_POTENTIAL', 'OUTSIDE_TARGET_MARKET',
  'INSUFFICIENT_EVIDENCE', 'OTHER', 'DUPLICATE',
] as const;
export type SignalDismissReasonCode = typeof SIGNAL_DISMISS_REASON_CODES[number];

export interface Signal {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  description: string | null;
  source: SignalSource;
  type: SignalType;
  /** The party this signal concerns, when known (reference + name snapshot). */
  accountId: Id | null;
  accountName: string | null;
  contactId: Id | null;
  /** Where the signal came from in the deal chain (project/contract/tender…) — reference + id. */
  contextType: string | null;
  contextId: Id | null;
  /** Why we believe this is real — freeform evidence / provenance. */
  evidence: string | null;
  /** 0–100 confidence the signal is worth investigating. */
  confidence: number;
  detectedAt: string;
  ownerId: Id | null;
  status: SignalStatus;
  /** Lineage: the Lead this signal was promoted into (set on PROMOTE). */
  promotedLeadId: Id | null;
  dismissalReason: string | null;
  dismissalReasonCode: SignalDismissReasonCode | null;
  dismissalNote: string | null;
  /** Last human triage decision, retained independently from the current lifecycle status. */
  reviewedBy: Id | null;
  reviewedAt: string | null;
  /** Idempotency / dedup key — a growth reactor sets this so it never re-emits the same signal. */
  dedupeKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSignal {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  description?: string | null;
  source: SignalSource;
  type: SignalType;
  accountId?: Id | null;
  accountName?: string | null;
  contactId?: Id | null;
  contextType?: string | null;
  contextId?: Id | null;
  evidence?: string | null;
  confidence?: number;
  detectedAt?: string | null;
  ownerId?: Id | null;
  status?: SignalStatus;
  dedupeKey?: string | null;
}

export function makeSignal(input: NewSignal): Signal {
  const now = new Date().toISOString();
  if (!(SIGNAL_SOURCES as readonly string[]).includes(input.source)) throw new Error('invalid signal source');
  if (!(SIGNAL_TYPES as readonly string[]).includes(input.type)) throw new Error('invalid signal type');
  if (input.status && !(SIGNAL_STATUSES as readonly string[]).includes(input.status)) throw new Error('invalid signal status');
  const conf = Number.isFinite(input.confidence) ? Number(input.confidence) : 50;
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    source: input.source,
    type: input.type,
    accountId: input.accountId ?? null,
    accountName: input.accountName?.trim() || null,
    contactId: input.contactId ?? null,
    contextType: input.contextType ?? null,
    contextId: input.contextId ?? null,
    evidence: input.evidence?.trim() || null,
    confidence: Math.max(0, Math.min(100, conf)),
    detectedAt: input.detectedAt ?? now,
    ownerId: input.ownerId ?? null,
    status: input.status ?? 'NEW',
    promotedLeadId: null,
    dismissalReason: null,
    dismissalReasonCode: null,
    dismissalNote: null,
    reviewedBy: null,
    reviewedAt: null,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a signal along the strict triage flow (NEW → REVIEWING → RESEARCHING). Terminal signals are frozen. */
export function advanceSignal(s: Signal, to: 'REVIEWING' | 'RESEARCHING', reviewedBy?: Id | null): Signal {
  if ((SIGNAL_TERMINAL_STATUSES as readonly string[]).includes(s.status)) {
    throw new Error(`signal is ${s.status} and can no longer change`);
  }
  const allowed: Record<SignalStatus, readonly SignalStatus[]> = {
    NEW: ['REVIEWING'],
    REVIEWING: ['RESEARCHING'],
    RESEARCHING: [],
    PROMOTED: [],
    DISMISSED: [],
    DUPLICATE: [],
  };
  if (!(allowed[s.status] as readonly string[]).includes(to)) {
    throw new Error(`invalid signal transition ${s.status} → ${to}`);
  }
  const now = new Date().toISOString();
  return { ...s, status: to, reviewedBy: reviewedBy ?? s.reviewedBy, reviewedAt: now, updatedAt: now };
}

/** Promote a signal to a lead — the lineage link. Idempotent guard: a promoted/dismissed signal
 * cannot be promoted again (invariant: promotion preserves attribution, and happens once). */
export function promoteSignal(s: Signal, leadId: Id, reviewedBy?: Id | null): Signal {
  if (s.status === 'PROMOTED') throw new Error(`signal is already promoted`);
  if ((SIGNAL_TERMINAL_STATUSES as readonly string[]).includes(s.status)) {
    throw new Error(`signal is ${s.status} and cannot be promoted`);
  }
  const now = new Date().toISOString();
  return { ...s, status: 'PROMOTED', promotedLeadId: leadId,
    reviewedBy: reviewedBy ?? s.reviewedBy, reviewedAt: now, updatedAt: now };
}

export function dismissSignal(s: Signal, reason: string, asDuplicate = false, note?: string | null): Signal {
  if ((SIGNAL_TERMINAL_STATUSES as readonly string[]).includes(s.status)) {
    throw new Error(`signal is ${s.status} and can no longer change`);
  }
  const normalizedReason = reason.trim();
  const known = (SIGNAL_DISMISS_REASON_CODES as readonly string[]).includes(normalizedReason);
  const code: SignalDismissReasonCode = asDuplicate ? 'DUPLICATE' : (known ? normalizedReason as SignalDismissReasonCode : 'OTHER');
  const explanation = note?.trim() || (!known && !asDuplicate ? normalizedReason : null);
  const now = new Date().toISOString();
  return {
    ...s,
    status: asDuplicate ? 'DUPLICATE' : 'DISMISSED',
    dismissalReason: normalizedReason || explanation || code,
    dismissalReasonCode: code,
    dismissalNote: explanation,
    reviewedAt: now,
    updatedAt: now,
  };
}

export const CRM_SIGNAL_EVENT = {
  detected: 'crm.signal.detected',
  reviewed: 'crm.signal.reviewed',
  promoted: 'crm.signal.promoted',
  dismissed: 'crm.signal.dismissed',
  duplicated: 'crm.signal.duplicated',
} as const;
