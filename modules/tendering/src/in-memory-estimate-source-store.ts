import type { Id } from '@aura/shared';
import type { EstimateSource } from './domain/estimate-source';
import type { EstimateSourceStore } from './estimate-source-store';

/** In-memory estimate-source store (dev/CI, no DB). Keyed by buildUpId+componentId. */
export class InMemoryEstimateSourceStore implements EstimateSourceStore {
  private readonly rows = new Map<string, EstimateSource>();

  private key(buildUpId: Id, componentId: Id): string {
    return `${buildUpId}::${componentId}`;
  }

  async upsert(source: EstimateSource): Promise<void> {
    this.rows.set(this.key(source.buildUpId, source.componentId), { ...source });
  }

  async getByComponent(tenantId: Id, buildUpId: Id, componentId: Id): Promise<EstimateSource | null> {
    const s = this.rows.get(this.key(buildUpId, componentId));
    return s && s.tenantId === tenantId ? { ...s } : null;
  }

  async listByTender(tenantId: Id, tenderId: Id): Promise<EstimateSource[]> {
    return [...this.rows.values()].filter((s) => s.tenantId === tenantId && s.tenderId === tenderId).map((s) => ({ ...s }));
  }

  async listByBuildUp(tenantId: Id, buildUpId: Id): Promise<EstimateSource[]> {
    return [...this.rows.values()].filter((s) => s.tenantId === tenantId && s.buildUpId === buildUpId).map((s) => ({ ...s }));
  }

  async listByRfq(tenantId: Id, rfqId: Id): Promise<EstimateSource[]> {
    return [...this.rows.values()].filter((s) => s.tenantId === tenantId && s.rfqId === rfqId).map((s) => ({ ...s }));
  }

  async remove(tenantId: Id, buildUpId: Id, componentId: Id): Promise<void> {
    const k = this.key(buildUpId, componentId);
    const s = this.rows.get(k);
    if (s && s.tenantId === tenantId) this.rows.delete(k);
  }

  async removeByBuildUp(tenantId: Id, buildUpId: Id): Promise<void> {
    for (const [k, s] of this.rows) {
      if (s.tenantId === tenantId && s.buildUpId === buildUpId) this.rows.delete(k);
    }
  }
}
