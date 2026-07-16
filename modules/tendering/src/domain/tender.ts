import { type Id, newId } from '@aura/shared';

// Tendering domain — framework-free. A Tender is a bid/proposal in response to a
// client opportunity: the second link in the deal chain (CRM → Tender → Contract →
// Project). It REFERENCES a CRM account by id + a name snapshot — never a DB join.

// T1 — the governed tender lifecycle (vision §2.2). The old set was `draft/submitted/won/lost`,
// which let a tender jump straight to `won` with no bid decision, no priced estimate and no
// submission on record. The intermediate states make those milestones real; the transition
// invariants that enforce them live in `tender-gate.ts`. `declined` is a terminal no-bid outcome
// (we chose not to bid) — captured, never deleted, so lessons survive. Old values keep their
// meaning, so the change is additive for existing rows and consumers.
export type TenderStatus =
  | 'draft'        // registered — an invitation/opportunity logged, not yet assessed
  | 'qualifying'   // under Bid/No-Bid assessment
  | 'estimating'   // decided to bid (go/conditional) — building the estimate
  | 'priced'       // the estimate is priced, ready for review/submission
  | 'submitted'    // the bid has been submitted to the client
  | 'won'
  | 'lost'
  | 'declined';    // decided NOT to bid (no-go) — terminal, kept for the record

export const TENDER_STATUSES: readonly TenderStatus[] = [
  'draft', 'qualifying', 'estimating', 'priced', 'submitted', 'won', 'lost', 'declined',
];

// T4 — the register's source classification (vision §2.2: "Invitations · Opportunities ·
// Public · Private"). WHERE the tender came from, orthogonal to where it stands (status):
//   invitation  — the client invited us to bid
//   public      — an open/public advertisement or portal listing
//   private     — a privately negotiated / single-source approach
//   opportunity — grown out of our own CRM pipeline (the deal-chain auto-tender)
// Nullable on the aggregate: an unclassified legacy row shows as such rather than guessing.
export type TenderSource = 'invitation' | 'public' | 'private' | 'opportunity';

export const TENDER_SOURCES: readonly TenderSource[] = ['invitation', 'public', 'private', 'opportunity'];

export interface Tender {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  title: string;
  reference: string | null;
  /** The CRM account (client) this tender is for — reference + snapshot, not a join. */
  accountId: Id | null;
  accountName: string | null;
  status: TenderStatus;
  /** Register classification — where the tender came from (null = unclassified legacy row). */
  source: TenderSource | null;
  /** Estimated bid value. */
  value: number;
  /** Client submission deadline (YYYY-MM-DD) — the date the bid must be in. */
  submissionDeadline: string | null;
  /** Opportunity this tender was auto-created from (deal chain), reference not join. */
  sourceOpportunityId: Id | null;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewTender {
  tenantId: Id;
  companyId?: Id | null;
  title: string;
  reference?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  status?: TenderStatus;
  source?: TenderSource | null;
  value?: number;
  submissionDeadline?: string | null;
  sourceOpportunityId?: Id | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeTender(input: NewTender): Tender {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    title: input.title.trim(),
    reference: input.reference?.trim() || null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    status: input.status ?? 'draft',
    // A tender born from an opportunity classifies itself; everything else is the caller's call.
    source: input.source ?? (input.sourceOpportunityId ? 'opportunity' : null),
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    submissionDeadline: input.submissionDeadline ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Tendering events on the spine.
 * `bidDecided` and `priced` are the vision's `estimating.bid.decided` / `estimating.quote.priced`
 * (§2.2). They keep the `tendering.` prefix every other tender event uses — the schema was never
 * renamed to `estimating`, and consistency inside the codebase beats matching an aspirational name. */
export const TENDER_EVENT = {
  created: 'tendering.tender.created',
  updated: 'tendering.tender.updated',
  bidDecided: 'tendering.tender.bid_decided',
  priced: 'tendering.tender.priced',
  submitted: 'tendering.tender.submitted',
  awarded: 'tendering.tender.awarded',
  lost: 'tendering.tender.lost',
  declined: 'tendering.tender.declined',
} as const;
