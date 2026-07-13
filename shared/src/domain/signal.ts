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

/** Statuses where a signal is still on the radar awaiting a triage decision. */
export const SIGNAL_OPEN_STATUSES: readonly SignalStatus[] = ['NEW', 'REVIEWING', 'RESEARCHING'];
/** Terminal statuses — off the radar. */
export const SIGNAL_TERMINAL_STATUSES: readonly SignalStatus[] = ['PROMOTED', 'DISMISSED', 'DUPLICATE'];

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
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a signal along the triage flow (NEW → REVIEWING → RESEARCHING). Terminal signals are frozen. */
export function advanceSignal(s: Signal, to: 'REVIEWING' | 'RESEARCHING'): Signal {
  if ((SIGNAL_TERMINAL_STATUSES as readonly string[]).includes(s.status)) {
    throw new Error(`signal is ${s.status} and can no longer change`);
  }
  return { ...s, status: to, updatedAt: new Date().toISOString() };
}

/** Promote a signal to a lead — the lineage link. Idempotent guard: a promoted/dismissed signal
 * cannot be promoted again (invariant: promotion preserves attribution, and happens once). */
export function promoteSignal(s: Signal, leadId: Id): Signal {
  if (s.status === 'PROMOTED') throw new Error(`signal is already promoted`);
  if ((SIGNAL_TERMINAL_STATUSES as readonly string[]).includes(s.status)) {
    throw new Error(`signal is ${s.status} and cannot be promoted`);
  }
  return { ...s, status: 'PROMOTED', promotedLeadId: leadId, updatedAt: new Date().toISOString() };
}

export function dismissSignal(s: Signal, reason: string, asDuplicate = false): Signal {
  if (s.status === 'PROMOTED') throw new Error(`signal is already promoted and cannot be dismissed`);
  return {
    ...s,
    status: asDuplicate ? 'DUPLICATE' : 'DISMISSED',
    dismissalReason: reason.trim() || null,
    updatedAt: new Date().toISOString(),
  };
}

export const CRM_SIGNAL_EVENT = {
  detected: 'crm.signal.detected',
  promoted: 'crm.signal.promoted',
  dismissed: 'crm.signal.dismissed',
} as const;
