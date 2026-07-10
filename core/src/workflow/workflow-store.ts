import type { Id, WorkflowDefinition, WorkflowInstance } from '@aura/shared';

/** DI token for the workflow persistence store. */
export const WORKFLOW_STORE = Symbol('WORKFLOW_STORE');

export interface WorkflowInstanceFilter {
  tenantId?: string;
  definitionKey?: string;
  aggregateType?: string;
  aggregateId?: string;
  status?: string;
  limit?: number;
}

/**
 * Persistence for workflow definitions + running instances. Postgres impl in
 * production; in-memory stand-in so the API boots without a DB. `getDefinition`
 * prefers a tenant-scoped definition, falling back to the global (tenantId null) one.
 */
export interface WorkflowStore {
  saveDefinition(def: WorkflowDefinition): Promise<void>;
  getDefinition(key: string, tenantId?: Id | null): Promise<WorkflowDefinition | null>;
  /** All definitions visible to a tenant (its own + global fallbacks) — admin registry. */
  listDefinitions(tenantId?: Id | null): Promise<WorkflowDefinition[]>;
  createInstance(instance: WorkflowInstance): Promise<void>;
  updateInstance(instance: WorkflowInstance): Promise<void>;
  getInstance(id: Id): Promise<WorkflowInstance | null>;
  listInstances(filter?: WorkflowInstanceFilter): Promise<WorkflowInstance[]>;
}
