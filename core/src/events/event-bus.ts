import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@aura/shared';

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * In-process pub/sub. Subscribe to an exact `module.aggregate.verb`, or to '*'
 * for every event. Phase 0 is in-memory; the future Kafka relay implements the
 * same `publish()` contract so subscribers never change.
 */
@Injectable()
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  /** Returns an unsubscribe function. */
  subscribe(typeOrWildcard: string, handler: EventHandler): () => void {
    const set = this.handlers.get(typeOrWildcard) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(typeOrWildcard, set);
    return () => set.delete(handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    const targets = [
      ...(this.handlers.get(event.type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];
    await Promise.all(targets.map((h) => h(event)));
  }
}
