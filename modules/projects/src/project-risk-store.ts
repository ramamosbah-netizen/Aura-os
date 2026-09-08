import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type { ProjectRisk } from './domain/project-risk';

/**
 * §21 — the risk register's port, declared apart from the issue register's.
 *
 * Separate files rather than one paired file, because the authority split (DG-21.4) is meant to be
 * visible in the import graph: `ProjectRiskService` imports this and nothing else, so it cannot
 * acquire the ability to write issues by accident.
 */

export const PROJECT_RISK_STORE = Symbol('PROJECT_RISK_STORE');

export interface ProjectRiskFilter {
  projectId?: Id;
  status?: string;
  area?: string;
  /** Only risks still carried as a live exposure (OPEN, MITIGATING or ACCEPTED). */
  openOnly?: boolean;
}

export interface ProjectRiskStore {
  create(risk: ProjectRisk): Promise<void>;
  update(risk: ProjectRisk): Promise<void>;
  /**
   * Retire a risk inside a caller's transaction — the materialisation command's half of the write.
   * `null` means no database (dev / in-memory), and the store falls back to its own write.
   */
  updateWithClient(tx: TxHandle | null, risk: ProjectRisk): Promise<void>;
  get(id: Id): Promise<ProjectRisk | null>;
  list(filter?: ProjectRiskFilter): Promise<ProjectRisk[]>;
}
