import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TenderSubmission } from './domain/submission';

/** DI token for the tender submission store. */
export const SUBMISSION_STORE = Symbol('SUBMISSION_STORE');

export interface SubmissionFilter {
  tenantId?: string;
  tenderId?: string;
  limit?: number;
}

export interface SubmissionStore {
  save(submission: TenderSubmission): Promise<void>;
  /** Transactional save — the submission record commits atomically with the status change and its
   * event (same seam as TenderStore.createWithClient). */
  saveWithClient(tx: TxHandle | null, submission: TenderSubmission): Promise<void>;
  get(id: Id): Promise<TenderSubmission | null>;
  list(filter?: SubmissionFilter): Promise<TenderSubmission[]>;
  listPaged(filter: SubmissionFilter, page: PageParams): Promise<Page<TenderSubmission>>;
}
