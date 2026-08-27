import type { Id, Opportunity, OpportunityStage, Page, PageParams, QualificationAtAward } from '@aura/shared';
import type { TxHandle } from '@aura/core';

export const CRM_OPPORTUNITY_STORE = Symbol('CRM_OPPORTUNITY_STORE');

export interface OpportunityFilter {
  tenantId?: string;
  stage?: OpportunityStage;
  leadId?: string;
  accountId?: string;
  /** Whose deals. See ActivityFilter.assigneeId. */
  ownerId?: string;
  limit?: number;
}

export interface OpportunityStore {
  create(opportunity: Opportunity): Promise<void>;
  createWithClient(tx: TxHandle | null, opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
  /**
   * Update inside a caller-provided transaction. `tx === null` degrades to a plain `update`. Without
   * this, an update issued inside `tx.run` runs on a SEPARATE pooled connection and escapes the
   * transaction — so the opportunity change and its event append would NOT commit or roll back as one.
   */
  updateWithClient(tx: TxHandle | null, opportunity: Opportunity): Promise<void>;
  /**
   * ADR-0020 — capture the immutable qualification-at-award snapshot, WRITE-ONCE.
   *
   * Deliberately NOT part of `update`: the generic writer sets every mutable column from an in-memory
   * entity, so routing the snapshot through it would let any ordinary PATCH carry a stale (or absent)
   * snapshot back over the stored one. This is a narrow statement that writes the column only when it
   * is still null, so a replayed award cannot rewrite history even before the database's own
   * immutability trigger is consulted.
   *
   * Returns whether THIS call captured. `false` means a snapshot was already there — the caller's
   * award was a replay, not a new one — and is never an error.
   */
  stampQualificationAtAward(tx: TxHandle | null, id: Id, snapshot: QualificationAtAward): Promise<boolean>;
  get(id: Id): Promise<Opportunity | null>;
  list(filter?: OpportunityFilter): Promise<Opportunity[]>;
  listPaged(filter: OpportunityFilter, page: PageParams): Promise<Page<Opportunity>>;
}
