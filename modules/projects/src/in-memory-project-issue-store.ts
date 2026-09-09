import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import { type ProjectIssue, issueIsOpen } from './domain/project-issue';
import type { ProjectIssueFilter, ProjectIssueStore } from './project-issue-store';

/**
 * The no-database path — dev boots without DATABASE_URL, and the e2e gate-off server.
 *
 * `create` enforces the same one-issue-per-risk rule the schema enforces with
 * `UNIQUE (origin_risk_id)`. Without it the in-memory path would permit a second materialisation
 * that Postgres refuses, and the two would disagree about what is possible.
 */
export class InMemoryProjectIssueStore implements ProjectIssueStore {
  private readonly rows = new Map<string, ProjectIssue>();

  private copy(i: ProjectIssue): ProjectIssue {
    return { ...i, references: i.references.map((r) => ({ ...r })) };
  }

  async create(issue: ProjectIssue): Promise<void> {
    if (issue.originRiskId) {
      const taken = [...this.rows.values()].some(
        (r) => r.originRiskId === issue.originRiskId && r.id !== issue.id,
      );
      if (taken) throw new Error(`risk ${issue.originRiskId} has already materialised into an issue`);
    }
    this.rows.set(issue.id, this.copy(issue));
  }

  async update(issue: ProjectIssue): Promise<void> {
    this.rows.set(issue.id, this.copy(issue));
  }

  async createWithClient(_tx: TxHandle | null, issue: ProjectIssue): Promise<void> {
    await this.create(issue);
  }

  async get(id: Id): Promise<ProjectIssue | null> {
    const found = this.rows.get(id);
    return found ? this.copy(found) : null;
  }

  async findByOriginRisk(riskId: Id): Promise<ProjectIssue | null> {
    for (const row of this.rows.values()) if (row.originRiskId === riskId) return this.copy(row);
    return null;
  }

  async list(filter: ProjectIssueFilter = {}): Promise<ProjectIssue[]> {
    let arr = Array.from(this.rows.values(), (i) => this.copy(i));
    if (filter.projectId) arr = arr.filter((i) => i.projectId === filter.projectId);
    if (filter.status) arr = arr.filter((i) => i.status === filter.status);
    if (filter.area) arr = arr.filter((i) => i.area === filter.area);
    if (filter.severity) arr = arr.filter((i) => i.severity === filter.severity);
    if (filter.openOnly) arr = arr.filter(issueIsOpen);
    if (filter.fromRiskOnly) arr = arr.filter((i) => i.originRiskId !== null);
    arr.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
    return filter.limit ? arr.slice(0, filter.limit) : arr;
  }
}
