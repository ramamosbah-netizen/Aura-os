import { type Id, newId } from '@aura/shared';

// Contracts domain — framework-free. Retention is money the client withholds from every IPC as
// security (typically 5% of work done, capped at 5–10% of the contract). It is the contractor's
// money all along; it is simply held. It comes back in tranches against contractual milestones:
//
//   • **Practical completion** — conventionally half the retention is released when the works are
//     taken over.
//   • **End of the defects liability period** — the balance, once the DLP expires with defects made
//     good.
//
// Without a release record the retention accrued on every certificate had no way home: the IPC
// math withholds it correctly and nothing ever gave it back. A release is raised, approved (the
// same segregation-of-duties + value-ceiling controls as certifying an IPC), and its approval is
// the AR trigger that bills the client for it.

export type RetentionReleaseKind = 'practical_completion' | 'defects_liability' | 'other';
export type RetentionReleaseStatus = 'draft' | 'approved' | 'rejected';

export const RETENTION_RELEASE_KINDS: readonly RetentionReleaseKind[] = [
  'practical_completion',
  'defects_liability',
  'other',
];

export interface RetentionRelease {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  contractId: Id;
  contractTitle: string | null;
  accountId: Id | null;
  accountName: string | null;
  /** Sequence within the contract — RET-001, RET-002, … */
  sequence: number;
  reference: string;
  kind: RetentionReleaseKind;
  amount: number;
  /** The milestone date the release is claimed against (YYYY-MM-DD). */
  releaseDate: string | null;
  status: RetentionReleaseStatus;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
  approvedBy: Id | null;
  approvedAt: string | null;
}

export interface NewRetentionRelease {
  tenantId: Id;
  companyId?: Id | null;
  contractId: Id;
  contractTitle?: string | null;
  accountId?: Id | null;
  accountName?: string | null;
  sequence: number;
  reference?: string | null;
  kind?: RetentionReleaseKind;
  amount: number;
  releaseDate?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function makeRetentionRelease(input: NewRetentionRelease): RetentionRelease {
  if (!input.contractId) throw new Error('contractId is required');
  const kind = input.kind ?? 'practical_completion';
  if (!RETENTION_RELEASE_KINDS.includes(kind)) throw new Error(`invalid retention release kind "${kind}"`);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('retention release amount must be positive');
  if (input.releaseDate && !DATE_RE.test(input.releaseDate)) throw new Error('releaseDate must be YYYY-MM-DD');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    contractId: input.contractId,
    contractTitle: input.contractTitle ?? null,
    accountId: input.accountId ?? null,
    accountName: input.accountName ?? null,
    sequence: input.sequence,
    reference: input.reference?.trim() || `RET-${String(input.sequence).padStart(3, '0')}`,
    kind,
    amount: round2(amount),
    releaseDate: input.releaseDate ?? null,
    status: 'draft',
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
  };
}

/**
 * Valid transitions. `approved` is the AR trigger — re-approving would bill the client for the
 * same tranche twice, exactly as re-certifying an IPC would (see CERTIFICATE_TRANSITIONS), so both
 * decided states are terminal.
 */
export const RETENTION_RELEASE_TRANSITIONS: Record<RetentionReleaseStatus, readonly RetentionReleaseStatus[]> = {
  draft: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function assertRetentionReleaseTransition(
  from: RetentionReleaseStatus,
  to: RetentionReleaseStatus,
  ref: string,
): void {
  const allowed = RETENTION_RELEASE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      allowed.length === 0
        ? `retention release ${ref} is already ${from} — it cannot be changed`
        : `retention release ${ref} is ${from} and can only move to ${allowed.join(' or ')}`,
    );
  }
}

export interface RetentionPosition {
  /** Retention withheld across the contract's issued certificates. */
  retentionHeld: number;
  /** Already approved (and therefore billed) releases. */
  released: number;
  /** Raised but not yet decided — reserved, so two drafts cannot each claim the whole balance. */
  pending: number;
  /** What may still be claimed: held − released − pending. */
  releasable: number;
}

export function retentionPosition(retentionHeld: number, releases: RetentionRelease[]): RetentionPosition {
  const held = Math.max(0, round2(Number(retentionHeld) || 0));
  const sum = (status: RetentionReleaseStatus): number =>
    round2(releases.filter((r) => r.status === status).reduce((t, r) => t + (Number(r.amount) || 0), 0));
  const released = sum('approved');
  const pending = sum('draft');
  return { retentionHeld: held, released, pending, releasable: round2(Math.max(0, held - released - pending)) };
}

/**
 * The conventional tranche for a milestone: half the retention at practical completion, the whole
 * remaining balance at the end of the defects liability period. A suggestion for the UI — the
 * amount is always the user's to set, because contracts vary.
 */
export function suggestedReleaseAmount(position: RetentionPosition, kind: RetentionReleaseKind): number {
  if (kind === 'practical_completion') return round2(Math.min(position.releasable, position.retentionHeld / 2));
  return position.releasable;
}

/** Refuse a release that would hand back more than was ever withheld. */
export function assertReleasable(position: RetentionPosition, amount: number): void {
  const a = round2(Number(amount) || 0);
  if (a > position.releasable + 0.01) {
    // "exceeds" leads the message so the error taxonomy classifies this as a 400 limit guard.
    // Avoid the word "already" here — the taxonomy reads it as a state conflict (409).
    throw new Error(
      `retention release of ${a} exceeds the ${position.releasable} still releasable ` +
        `(${position.retentionHeld} held, ${position.released} released to date, ${position.pending} pending)`,
    );
  }
}

export const RETENTION_EVENT = {
  raised: 'contracts.retention.raised',
  /** The AR trigger — finance bills the client for the released tranche. */
  released: 'contracts.retention.released',
  rejected: 'contracts.retention.rejected',
} as const;
