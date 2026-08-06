import type { Id } from '@aura/shared';
import type { RetentionRelease } from './domain/retention-release';
import type { RetentionReleaseFilter, RetentionReleaseStore } from './retention-release-store';

/** Phase-0 retention-release store — in memory (no-DB boots). */
export class InMemoryRetentionReleaseStore implements RetentionReleaseStore {
  private readonly releases = new Map<string, RetentionRelease>();

  async save(r: RetentionRelease): Promise<void> {
    this.releases.set(r.id, { ...r });
  }

  async get(id: Id): Promise<RetentionRelease | null> {
    const r = this.releases.get(id);
    return r ? { ...r } : null;
  }

  async list(filter: RetentionReleaseFilter = {}): Promise<RetentionRelease[]> {
    let out = [...this.releases.values()];
    if (filter.tenantId) out = out.filter((r) => r.tenantId === filter.tenantId);
    if (filter.contractId) out = out.filter((r) => r.contractId === filter.contractId);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    out.sort((a, b) => a.sequence - b.sequence);
    return (filter.limit ? out.slice(0, filter.limit) : out).map((r) => ({ ...r }));
  }
}
