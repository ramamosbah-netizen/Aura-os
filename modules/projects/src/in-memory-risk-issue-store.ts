import type { Id } from '@aura/shared';
import { type ProjectRisk, projectRiskIsOpen } from './domain/project-risk';
import { type ProjectIssue, issueIsOpen } from './domain/project-issue';
import type {
  ProjectIssueFilter, ProjectIssueStore, ProjectRiskFilter, ProjectRiskStore,
} from './risk-issue-store';

/**
 * The no-database path — dev boots without DATABASE_URL, and the e2e gate-off server.
 *
 * `openOnly` is answered with the same domain predicate the Postgres store's SQL encodes, so the
 * two paths cannot drift on what "still live" means.
 */

export class InMemoryProjectRiskStore implements ProjectRiskStore {
  private readonly rows = new Map<string, ProjectRisk>();

  async create(risk: ProjectRisk): Promise<void> {
    this.rows.set(risk.id, { ...risk });
  }

  async update(risk: ProjectRisk): Promise<void> {
    this.rows.set(risk.id, { ...risk });
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
    return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryProjectIssueStore implements ProjectIssueStore {
  private readonly rows = new Map<string, ProjectIssue>();

  async create(issue: ProjectIssue): Promise<void> {
    this.rows.set(issue.id, { ...issue, links: [...issue.links] });
  }

  async update(issue: ProjectIssue): Promise<void> {
    this.rows.set(issue.id, { ...issue, links: [...issue.links] });
  }

  async get(id: Id): Promise<ProjectIssue | null> {
    const found = this.rows.get(id);
    return found ? { ...found, links: [...found.links] } : null;
  }

  async list(filter: ProjectIssueFilter = {}): Promise<ProjectIssue[]> {
    let arr = Array.from(this.rows.values(), (i) => ({ ...i, links: [...i.links] }));
    if (filter.projectId) arr = arr.filter((i) => i.projectId === filter.projectId);
    if (filter.status) arr = arr.filter((i) => i.status === filter.status);
    if (filter.area) arr = arr.filter((i) => i.area === filter.area);
    if (filter.severity) arr = arr.filter((i) => i.severity === filter.severity);
    if (filter.openOnly) arr = arr.filter(issueIsOpen);
    return arr.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
  }
}
