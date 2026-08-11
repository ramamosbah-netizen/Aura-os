import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore } from '@aura/core';
import { AmcService, InMemoryAmcStore } from '@aura/amc';
import { makeEvent } from '@aura/shared';
import { HandoverAmcSubscriber } from './handover-amc-subscriber';

/**
 * The AMC trigger (gap register N-02).
 *
 * A project being *complete* and a client having *accepted the handover* are different moments,
 * and only the second starts the warranty clock the AMC is priced against. The batch added a
 * second reactor on `projects.project.completed`, which would have opened a service contract
 * before anyone signed for the work — and, alongside this one, opened two.
 *
 * These tests pin the trigger to client acceptance and guard the wrong event staying gone.
 */
const tenantId = 'tenant-amc';

function harness() {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const amc = new AmcService(new InMemoryAmcStore(), events);
  const subscriber = new HandoverAmcSubscriber(bus, amc);
  subscriber.onModuleInit();
  return { bus, events, amc };
}

const acceptance = (over: Record<string, unknown> = {}) =>
  makeEvent({
    type: 'commissioning.handover.accepted',
    aggregateId: 'handover-9f8e7d6c',
    aggregateType: 'handover',
    tenantId,
    payload: {
      projectName: 'Sustainable City — Phase 2 ELV',
      warrantyStartDate: '2026-09-01',
      warrantyMonths: 24,
      ...over,
    },
  });

describe('Handover → AMC', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('opens a service contract when the client accepts the handover', async () => {
    await h.events.append([acceptance()]);

    const contracts = await h.amc.listContracts(tenantId);
    expect(contracts).toHaveLength(1);
    expect(contracts[0].clientName).toBe('Sustainable City — Phase 2 ELV');
  });

  it('takes the warranty window from the handover, not from today', async () => {
    await h.events.append([acceptance()]);

    const [c] = await h.amc.listContracts(tenantId);
    expect(new Date(c.startDate).toISOString().slice(0, 10)).toBe('2026-09-01');
    // 24 months on from the accepted start, not a hardcoded year from the reactor firing.
    expect(new Date(c.endDate).toISOString().slice(0, 10)).toBe('2028-09-01');
  });

  it('defaults to a 12-month warranty when the handover does not state one', async () => {
    await h.events.append([acceptance({ warrantyMonths: null })]);

    const [c] = await h.amc.listContracts(tenantId);
    const months =
      (new Date(c.endDate).getFullYear() - new Date(c.startDate).getFullYear()) * 12 +
      (new Date(c.endDate).getMonth() - new Date(c.startDate).getMonth());
    expect(months).toBe(12);
  });

  it('prices at zero — the system knows an AMC is due, it does not presume the price', async () => {
    await h.events.append([acceptance()]);

    const [c] = await h.amc.listContracts(tenantId);
    expect(c.value).toBe(0);
  });

  it('is idempotent under event re-delivery', async () => {
    await h.events.append([acceptance()]);
    await h.events.append([acceptance()]);

    expect(await h.amc.listContracts(tenantId)).toHaveLength(1);
  });

  it('does NOT open a contract when a project merely completes (N-02 regression guard)', async () => {
    // Completion is not acceptance. If this ever passes again, the warranty clock is starting
    // before the client has signed for the work.
    await h.events.append([
      makeEvent({
        type: 'projects.project.completed',
        aggregateId: 'project-1234abcd',
        aggregateType: 'project',
        tenantId,
        payload: { title: 'Sustainable City — Phase 2 ELV', accountName: 'Diamond Developers' },
      }),
    ]);

    expect(await h.amc.listContracts(tenantId)).toHaveLength(0);
  });
});
