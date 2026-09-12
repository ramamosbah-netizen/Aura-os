import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from '@aura/shared';
// Static imports: `vi.mock` above is hoisted, so the stub is in place before these resolve. Dynamic
// `await import(...)` would work at runtime but is a top-level await, which this package's tsconfig
// target rejects.
import { sendWebhook } from './webhook-send';
import { WebhookDispatcher } from './webhook-dispatcher';
import { InMemoryWebhookStore } from './in-memory-webhook-store';
import { EventBus } from '../events/event-bus';

/**
 * The one duplicate in this system that leaves the building (TC-GATE-22).
 *
 * `WebhookDispatcher` subscribes to `*`, so it receives EVERY event. The outbox relay retries the
 * whole event whenever ANY handler in the fan-out rejects — and `EventBus.publish` is a `Promise.all`
 * over every subscriber, so one failure anywhere re-delivers to all of them.
 *
 * The dispatcher POSTed and then recorded the delivery. Nothing read that record before POSTing. So a
 * failure in, say, a cost reactor caused the customer's endpoint to receive the same business event a
 * second time — and the people affected are outside this system and cannot see the cause.
 *
 * `sendWebhook` is stubbed because the assertion is about how many times it is CALLED.
 */
vi.mock('./webhook-send', () => ({
  sendWebhook: vi.fn(async () => ({ ok: true, statusCode: 200, error: null })),
}));

const TENANT = 'tenant-hook';

describe('webhook dispatcher on re-delivery', () => {
  let bus: EventBus;
  let store: InMemoryWebhookStore;

  const event = (aggregateId: string) =>
    makeEvent({
      type: 'projects.project.completed',
      tenantId: TENANT,
      companyId: null,
      actorId: null,
      aggregateType: 'projects.project',
      aggregateId,
      payload: { title: 'Tower A' },
    });

  beforeEach(async () => {
    vi.mocked(sendWebhook).mockClear();
    bus = new EventBus();
    store = new InMemoryWebhookStore();
    await store.saveSubscription({
      id: 'sub-1',
      tenantId: TENANT,
      eventTypes: ['projects.*'],
      url: 'https://client.example/hooks/aura',
      secret: 's3cret',
      active: true,
      createdAt: new Date().toISOString(),
    });
    new WebhookDispatcher(bus, store).onModuleInit();
  });

  it('POSTs once, and not again when the same event is re-delivered', async () => {
    const e = event('project-1');

    await bus.publish(e);
    expect(vi.mocked(sendWebhook), 'it must actually send the first time').toHaveBeenCalledTimes(1);

    // Exactly what the relay does after any sibling handler fails.
    await bus.publish(e);

    expect(
      vi.mocked(sendWebhook),
      'a customer endpoint must not receive the same business event twice because something unrelated failed',
    ).toHaveBeenCalledTimes(1);
  });

  it('still sends a different event — the record is keyed by event, not by subscription', async () => {
    await bus.publish(event('project-1'));
    await bus.publish(event('project-2'));

    expect(
      vi.mocked(sendWebhook),
      'skipping by subscription alone would silence every webhook after the first',
    ).toHaveBeenCalledTimes(2);
  });

  it('records the delivery it made, which is what the skip reads back', async () => {
    const e = event('project-3');
    await bus.publish(e);

    expect(await store.deliveryExists('sub-1', e.id)).toBe(true);
    expect(await store.deliveryExists('sub-1', 'some-other-event')).toBe(false);
  });
});
