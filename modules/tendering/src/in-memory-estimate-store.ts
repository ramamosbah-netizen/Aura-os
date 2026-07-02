import type { Id } from '@aura/shared';
import type { RateBuildUp } from './domain/estimate';
import type { EstimateStore } from './estimate-store';

/** Phase-0 estimate store — keeps rate build-ups in memory (no-DB boots). */
export class InMemoryEstimateStore implements EstimateStore {
  private readonly buildUps = new Map<string, RateBuildUp>();

  async save(b: RateBuildUp): Promise<void> {
    this.buildUps.set(b.id, { ...b, components: b.components.map((c) => ({ ...c })) });
  }

  async get(id: Id): Promise<RateBuildUp | null> {
    const b = this.buildUps.get(id);
    return b ? { ...b, components: b.components.map((c) => ({ ...c })) } : null;
  }

  async getByBoqItem(tenantId: string, boqItemId: Id): Promise<RateBuildUp | null> {
    for (const b of this.buildUps.values()) {
      if (b.tenantId === tenantId && b.boqItemId === boqItemId) {
        return { ...b, components: b.components.map((c) => ({ ...c })) };
      }
    }
    return null;
  }

  async listByTender(tenantId: string, tenderId: Id): Promise<RateBuildUp[]> {
    return [...this.buildUps.values()]
      .filter((b) => b.tenantId === tenantId && b.tenderId === tenderId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((b) => ({ ...b, components: b.components.map((c) => ({ ...c })) }));
  }

  async delete(id: Id): Promise<void> {
    this.buildUps.delete(id);
  }
}
