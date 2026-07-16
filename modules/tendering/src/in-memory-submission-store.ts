import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TenderSubmission } from './domain/submission';
import type { SubmissionFilter, SubmissionStore } from './submission-store';

/** Phase-0 submission store — keeps submission records in memory (no-DB boots). */
export class InMemorySubmissionStore implements SubmissionStore {
  private readonly submissions = new Map<string, TenderSubmission>();

  async save(submission: TenderSubmission): Promise<void> {
    this.submissions.set(submission.id, { ...submission });
  }

  async saveWithClient(_tx: TxHandle | null, submission: TenderSubmission): Promise<void> {
    await this.save(submission);
  }

  async get(id: Id): Promise<TenderSubmission | null> {
    const s = this.submissions.get(id);
    return s ? { ...s } : null;
  }

  async list(filter: SubmissionFilter = {}): Promise<TenderSubmission[]> {
    let out = [...this.submissions.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.tenderId) out = out.filter((s) => s.tenderId === filter.tenderId);
    out.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: SubmissionFilter, page: PageParams): Promise<Page<TenderSubmission>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
