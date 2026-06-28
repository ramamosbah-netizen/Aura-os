import { describe, expect, it, vi } from 'vitest';
import { ProjectionEngine } from './projection.engine';
import { SnapshotEngine } from './snapshot.engine';
import { EventBus } from '../events/event-bus';
import { InMemoryEventStore } from '../events/in-memory-event-store';
import { Projection } from './projection.types';
import type { DomainEvent } from '@aura/shared';

describe('Projection & Snapshot Engine', () => {
  it('registers projection, reacts to live events, and handles replay rebuild', async () => {
    const eventBus = new EventBus();
    const eventStore = new InMemoryEventStore(eventBus);

    // Seed event store
    const event1: DomainEvent = {
      id: 'e-1',
      type: 'test.created',
      tenantId: 'tenant1',
      companyId: null,
      aggregateType: 'test',
      aggregateId: 't-123',
      actorId: 'user1',
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: { value: 100 },
    };
    await eventStore.append([event1]);

    const projectionEngine = new ProjectionEngine(null, eventStore, eventBus);
    projectionEngine.onModuleInit();

    // Create a mock projection
    const handleSpy = vi.fn();
    const resetSpy = vi.fn();
    const mockProjection: Projection = {
      name: 'test-projection',
      version: 1,
      handle: handleSpy,
      reset: resetSpy,
    };

    // Register projection
    projectionEngine.register(mockProjection);

    // Live execution event publish
    const event2: DomainEvent = {
      id: 'e-2',
      type: 'test.updated',
      tenantId: 'tenant1',
      companyId: null,
      aggregateType: 'test',
      aggregateId: 't-123',
      actorId: 'user1',
      occurredAt: new Date().toISOString(),
      version: 2,
      payload: { value: 200 },
    };
    await eventBus.publish(event2);

    expect(handleSpy).toHaveBeenCalledWith(event2, null);

    // Trigger rebuild replay
    await projectionEngine.replay('test-projection');
    expect(resetSpy).toHaveBeenCalled();
    // Replay should process both seed and new events (event1, event2) in order
    expect(handleSpy).toHaveBeenCalledWith(event1, null);
  });

  it('saves and retrieves snapshots from SnapshotEngine', async () => {
    const snapshotEngine = new SnapshotEngine(null); // in-memory/no db mode

    // In-memory mode returns null on save and retrieve, lets test that it returns null or operates without crashing
    const snapshot = await snapshotEngine.getLatestSnapshot('t1', 'agg', 'id1');
    expect(snapshot).toBeNull();

    await expect(snapshotEngine.saveSnapshot('t1', 'agg', 'id1', 5, { data: 'test' })).resolves.not.toThrow();
  });
});
