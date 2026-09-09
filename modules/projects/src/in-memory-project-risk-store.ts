import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import { type ProjectRisk, projectRiskIsOpen } from './domain/project-risk';
import type { ProjectRiskFilter, ProjectRiskStore } from './project-risk-store';

/**
 * The no-database path — dev boots without DATABASE_URL, and the e2e gate-off server.
 *
 * `openOnly` is answered with the same domain predicate the Postgres store's SQL encodes, so the
 * two paths cannot drift on what "still carried as an exposure" means.
 *
 * `updateWithClient` ignores its handle: there is no transaction to join, so the write is not
 * atomic here. That is a real difference from production and is why the materialisation proof runs
 * against Postgres, not against this.
 */
export class InMemoryProjectRiskStore implements ProjectRiskStore {
  private readonly rows = new Map<string, ProjectRisk>();

  async create(risk: ProjectRisk): Promise<void> {
    this.rows.set(risk.id, { ...risk });
  }

  async update(risk: ProjectRisk): Promise<void> {
    this.rows.set(risk.id, { ...risk });
  }

  async updateWithClient(_tx: TxHandle | null, risk: ProjectRisk): Promise<void> {
    await this.update(risk);
  }

  async get(id: Id): Promise<ProjectRisk | null> {
    const found = this.rows.get(id);
    return found ? { ...found } : null;
  }

  async list(filter: ProjectRiskFilter = {}): Promise<ProjectRisk[]> {
    let arr = Array.from(this.rows.values(), (r) => ({ ...r }));
    if (filter.projectId) arr = arr.filter((r) => r.projectId === filter.projectId);
    if (filter.status) arr = arr.filter((r) => r.status === filter.status);
    if (filter.area) arr = arr.filter((r) => r.area === filter.area);
    if (filter.openOnly) arr = arr.filter(projectRiskIsOpen);
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit ? arr.slice(0, filter.limit) : arr;
  }
}
