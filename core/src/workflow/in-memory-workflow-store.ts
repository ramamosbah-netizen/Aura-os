import type { Id, WorkflowDefinition, WorkflowInstance } from '@aura/shared';
import type { WorkflowInstanceFilter, WorkflowStore } from './workflow-store';

/** In-memory workflow store — the boot-safe fallback when there's no DATABASE_URL. */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly defs = new Map<string, WorkflowDefinition>();
  private readonly instances = new Map<Id, WorkflowInstance>();

  private defKey(key: string, tenantId?: Id | null): string {
    return `${tenantId ?? ''}::${key}`;
  }

  async saveDefinition(def: WorkflowDefinition): Promise<void> {
    this.defs.set(this.defKey(def.key, def.tenantId), def);
  }

  async getDefinition(key: string, tenantId?: Id | null): Promise<WorkflowDefinition | null> {
    return this.defs.get(this.defKey(key, tenantId ?? null)) ?? this.defs.get(this.defKey(key, null)) ?? null;
  }

  async createInstance(instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  async updateInstance(instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  async getInstance(id: Id): Promise<WorkflowInstance | null> {
    return this.instances.get(id) ?? null;
  }

  async listInstances(filter: WorkflowInstanceFilter = {}): Promise<WorkflowInstance[]> {
    let out = [...this.instances.values()];
    if (filter.tenantId) out = out.filter((i) => i.tenantId === filter.tenantId);
    if (filter.definitionKey) out = out.filter((i) => i.definitionKey === filter.definitionKey);
    if (filter.aggregateType) out = out.filter((i) => i.aggregateType === filter.aggregateType);
    if (filter.aggregateId) out = out.filter((i) => i.aggregateId === filter.aggregateId);
    if (filter.status) out = out.filter((i) => i.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
