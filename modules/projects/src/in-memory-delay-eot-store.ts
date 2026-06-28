import type { Id } from '@aura/shared';
import type { DelayEvent, EotClaim } from './domain/delay-eot';
import type { DelayFilter, DelayStore, EotFilter, EotStore } from './delay-eot-store';

export class InMemoryDelayStore implements DelayStore {
  private readonly rows = new Map<string, DelayEvent>();

  async create(event: DelayEvent): Promise<void> {
    this.rows.set(event.id, { ...event });
  }

  async update(event: DelayEvent): Promise<void> {
    this.rows.set(event.id, { ...event });
  }

  async get(id: Id): Promise<DelayEvent | null> {
    return this.rows.get(id) ?? null;
  }

  async list(filter?: DelayFilter): Promise<DelayEvent[]> {
    let arr = Array.from(this.rows.values());
    if (filter?.projectId) arr = arr.filter((e) => e.projectId === filter.projectId);
    if (filter?.causeCategory) arr = arr.filter((e) => e.causeCategory === filter.causeCategory);
    if (filter?.status) arr = arr.filter((e) => e.status === filter.status);
    return arr;
  }
}

export class InMemoryEotStore implements EotStore {
  private readonly rows = new Map<string, EotClaim>();

  async create(claim: EotClaim): Promise<void> {
    this.rows.set(claim.id, { ...claim });
  }

  async update(claim: EotClaim): Promise<void> {
    this.rows.set(claim.id, { ...claim });
  }

  async get(id: Id): Promise<EotClaim | null> {
    return this.rows.get(id) ?? null;
  }

  async list(filter?: EotFilter): Promise<EotClaim[]> {
    let arr = Array.from(this.rows.values());
    if (filter?.projectId) arr = arr.filter((c) => c.projectId === filter.projectId);
    if (filter?.status) arr = arr.filter((c) => c.status === filter.status);
    return arr;
  }
}
