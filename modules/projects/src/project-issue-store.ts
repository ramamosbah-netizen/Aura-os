import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type { ProjectIssue } from './domain/project-issue';

/**
 * §21 — the issue register's port, declared apart from the risk register's (DG-21.4).
 */

export const PROJECT_ISSUE_STORE = Symbol('PROJECT_ISSUE_STORE');

export interface ProjectIssueFilter {
  projectId?: Id;
  status?: string;
  area?: string;
  severity?: string;
  /** Only issues still live (open or in_progress). */
  openOnly?: boolean;
  /** Issues that came from the risk register. */
  fromRiskOnly?: boolean;
}

export interface ProjectIssueStore {
  create(issue: ProjectIssue): Promise<void>;
  update(issue: ProjectIssue): Promise<void>;
  /**
   * Create an issue inside a caller's transaction — the materialisation command's other half.
   * `null` means no database (dev / in-memory), and the store falls back to its own write.
   */
  createWithClient(tx: TxHandle | null, issue: ProjectIssue): Promise<void>;
  get(id: Id): Promise<ProjectIssue | null>;
  list(filter?: ProjectIssueFilter): Promise<ProjectIssue[]>;
  /**
   * The issue a given risk materialised into, if any.
   *
   * Exists because provenance is stored once, on this side. Without it, "has this risk landed?"
   * could only be answered by a column on the risk — which is precisely the duplicated,
   * disagreeable truth DG-21.3 removed.
   */
  findByOriginRisk(riskId: Id): Promise<ProjectIssue | null>;
}
