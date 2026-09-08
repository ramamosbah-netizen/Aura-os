import type { Id } from '@aura/shared';
import type { ProjectRisk } from './domain/project-risk';
import type { ProjectIssue } from './domain/project-issue';

/**
 * §21 — two registers, two ports, two tables.
 *
 * Paired in one file the way `delay-eot-store.ts` pairs delays and EOT claims: they are read
 * together and materialisation writes both. They are never merged — a risk and an issue keep their
 * own rows, their own lifecycles and their own storage.
 */

export const PROJECT_RISK_STORE = Symbol('PROJECT_RISK_STORE');
export const PROJECT_ISSUE_STORE = Symbol('PROJECT_ISSUE_STORE');

export interface ProjectRiskFilter {
  projectId?: Id;
  status?: string;
  area?: string;
  /** Only risks still carried as a live exposure (OPEN or MITIGATING). */
  openOnly?: boolean;
}

export interface ProjectIssueFilter {
  projectId?: Id;
  status?: string;
  area?: string;
  severity?: string;
  /** Only issues still live (open or in_progress). */
  openOnly?: boolean;
}

export interface ProjectRiskStore {
  create(risk: ProjectRisk): Promise<void>;
  update(risk: ProjectRisk): Promise<void>;
  get(id: Id): Promise<ProjectRisk | null>;
  list(filter?: ProjectRiskFilter): Promise<ProjectRisk[]>;
}

export interface ProjectIssueStore {
  create(issue: ProjectIssue): Promise<void>;
  update(issue: ProjectIssue): Promise<void>;
  get(id: Id): Promise<ProjectIssue | null>;
  list(filter?: ProjectIssueFilter): Promise<ProjectIssue[]>;
}
