import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@aura/shared';
import type { DeadLetteredEvent, EventFilter, EventStore } from './event-store';
import type { TxHandle } from './tx';
import { EventBus } from './event-bus';

/**
 * Phase-0 EventStore: keeps events in memory and relays each to the EventBus —
 * standing in for the Postgres ledger + transactional-outbox relay to come.
 */
@Injectable()
export class InMemoryEventStore implements EventStore {
  private readonly events: DomainEvent[] = [];

  constructor(private readonly bus: EventBus) {}

  async append(events: DomainEvent[]): Promise<void> {
    for (const e of events) {
      this.events.push(e);
      await this.bus.publish(e); // stand-in for the outbox relay
    }
  }

  // No real transactions in memory — ignore the handle and append normally.
  async appendWithClient(_tx: TxHandle | null, events: DomainEvent[]): Promise<void> {
    return this.append(events);
  }

  async list(filter: EventFilter = {}): Promise<DomainEvent[]> {
    let out = this.events;
    if (filter.tenantId) out = out.filter((e) => e.tenantId === filter.tenantId);
    if (filter.type) out = out.filter((e) => e.type === filter.type);
    if (filter.aggregateId) out = out.filter((e) => e.aggregateId === filter.aggregateId);
    return filter.limit ? out.slice(-filter.limit) : [...out];
  }

  // No outbox/relay in memory mode, so nothing is ever dead-lettered.
  async listDeadLettered(): Promise<DeadLetteredEvent[]> {
    return [];
  }
}
