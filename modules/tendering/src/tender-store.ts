import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Tender } from './domain/tender';
import type { TenderAwardEvidence } from './domain/tender-award-evidence';
import type { TenderCommercialBasis } from './domain/tender-commercial-basis';

/** DI token for the tender store. */
export const TENDER_STORE = Symbol('TENDER_STORE');

export interface TenderFilter {
  tenantId?: string;
  status?: string;
  /** Register classification (T4): invitation / public / private / opportunity. */
  source?: string;
  accountId?: string;
  /** The opportunity this tender was started from — the provenance link the Opportunity 360 follows
   * (works even when the deal has no account, which account-scoped filtering would miss). */
  sourceOpportunityId?: string;
  limit?: number;
}

export interface TenderStore {
  create(tender: Tender): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, tender: Tender): Promise<void>;
  update(tender: Tender): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, tender: Tender): Promise<void>;
  get(id: Id): Promise<Tender | null>;
  list(filter?: TenderFilter): Promise<Tender[]>;
  listPaged(filter: TenderFilter, page: PageParams): Promise<Page<Tender>>;
  /**
   * ADR-0021 — WRITE-ONCE capture of the customer's award evidence, together with the `won`
   * transition it justifies. Returns `false` when the tender already carries evidence (the
   * guard is `WHERE award_evidence IS NULL`, so a replay matches no row and changes nothing)
   * rather than overwriting. A dedicated method — not the generic `update` — because
   * immutability must bind every writer, not only the disciplined ones; `update` deliberately
   * does not carry this column at all.
   */
  awardWithClient(tx: TxHandle | null, id: Id, evidence: TenderAwardEvidence): Promise<boolean>;
  /**
   * WRITE-ONCE capture of the commercial basis. Returns `false` when a basis already exists
   * (`WHERE commercial_basis IS NULL`), so a replay — or a DIFFERENT baseline locking later —
   * changes nothing rather than silently re-basing a contract that already exists.
   * Deliberately NOT part of the generic `update`, so no ordinary edit can reach the column.
   */
  linkCommercialBasisWithClient(tx: TxHandle | null, id: Id, basis: TenderCommercialBasis): Promise<boolean>;
}

