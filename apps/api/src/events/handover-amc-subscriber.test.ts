import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus, InMemoryEventStore } from '@aura/core';
import { AmcService, InMemoryAmcStore } from '@aura/amc';
import { makeEvent } from '@aura/shared';
import { CUSTOMER_NOT_RECORDED, HandoverAmcSubscriber } from './handover-amc-subscriber';

/**
 * The AMC trigger (gap register N-02) and what the contract it opens says (J6-01).
 *
 * A project being *complete* and a client having *accepted the handover* are different moments,
 * and only the second starts the warranty clock the AMC is priced against. The batch added a
 * second reactor on `projects.project.completed`, which would have opened a service contract
 * before anyone signed for the work — and, alongside this one, opened two.
 *
 * J6-01: the contract used to carry no project and no handover and put the PROJECT's name in the
 * client field (this file asserted exactly that). It now names the project, the handover and the
 * customer from the project's canonical account — and says so plainly when there is none.
 */
const tenantId = 'tenant-amc';
const PROJECT_ID = '3f1c2b7a-5d4e-4c3b-9a8f-1e2d3c4b5a69';
const HANDOVER_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

type ProjectRecord = { id: string; tenantId: string; title: string; accountId: string | null; accountName: string | null };

function harness(projects: ProjectRecord[] = [
  { id: PROJECT_ID, tenantId, title: 'Sustainable City — Phase 2 ELV', accountId: 'acc-diamond', accountName: 'Diamond Developers' },
]) {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const amc = new AmcService(new InMemoryAmcStore(), events);
  const reader = { get: async (id: string) => (projects.find((p) => p.id === id) ?? null) as never };
  const subscriber = new HandoverAmcSubscriber(bus, amc, reader);
  subscriber.onModuleInit();
  return { bus, events, amc };
}

const acceptance = (over: Record<string, unknown> = {}, aggregateId = HANDOVER_ID) =>
  makeEvent({
    type: 'commissioning.handover.accepted',
    aggregateId,
    aggregateType: 'handover',
    tenantId,
    payload: {
      projectId: PROJECT_ID,
      projectName: 'Sustainable City — Phase 2 ELV',
      warrantyStartDate: '2026-09-01',
      warrantyMonths: 24,
      ...over,
    },
  });

/** Contracts this harness opened (the in-memory store seeds two demo contracts of its own). */
const opened = async (amc: AmcService) => (await amc.listContracts(tenantId)).filter((c) => c.source === 'handover');

describe('Handover → AMC', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it('opens a service contract when the client accepts the handover', async () => {
    await h.events.append([acceptance()]);
    expect(await opened(h.amc)).toHaveLength(1);
  });

  it('names the customer from the project’s account, and the project and handover it came from (J6-01)', async () => {
    await h.events.append([acceptance()]);
    const [c] = await opened(h.amc);
    expect(c).toMatchObject({
      clientName: 'Diamond Developers',
      accountId: 'acc-diamond',
      projectId: PROJECT_ID,
      projectName: 'Sustainable City — Phase 2 ELV',
      handoverId: HANDOVER_ID,
      source: 'handover',
    });
    expect(c.clientName, 'the project is not the customer').not.toBe('Sustainable City — Phase 2 ELV');
  });

  it('says the customer is not recorded rather than borrowing the project’s name', async () => {
    h = harness([{ id: PROJECT_ID, tenantId, title: 'Sustainable City — Phase 2 ELV', accountId: null, accountName: null }]);
    await h.events.append([acceptance()]);
    const [c] = await opened(h.amc);
    expect(c).toMatchObject({ clientName: CUSTOMER_NOT_RECORDED, accountId: null, projectId: PROJECT_ID });
  });

  it('does not read a customer from a project in another tenant', async () => {
    h = harness([{ id: PROJECT_ID, tenantId: 'someone-else', title: 'Their project', accountId: 'acc-theirs', accountName: 'Their Customer' }]);
    await h.events.append([acceptance()]);
    const [c] = await opened(h.amc);
    expect(c.clientName).toBe(CUSTOMER_NOT_RECORDED);
    expect(c.accountId).toBeNull();
  });

  it('opens nothing for an acceptance that names no project — an orphan contract is the defect', async () => {
    await h.events.append([acceptance({ projectId: undefined })]);
    expect(await opened(h.amc)).toHaveLength(0);
  });

  it('takes the warranty window from the handover, not from today', async () => {
    await h.events.append([acceptance()]);
    const [c] = await opened(h.amc);
    expect(new Date(c.startDate).toISOString().slice(0, 10)).toBe('2026-09-01');
    // 24 months on from the accepted start, not a hardcoded year from the reactor firing.
    expect(new Date(c.endDate).toISOString().slice(0, 10)).toBe('2028-09-01');
  });

  it('counts warranty months on the calendar — the 31st ends on the last day of a shorter month', async () => {
    await h.events.append([acceptance({ warrantyStartDate: '2026-08-31', warrantyMonths: 6 })]);
    const [c] = await opened(h.amc);
    expect(new Date(c.endDate).toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('defaults to a 12-month warranty when the handover does not state one', async () => {
    await h.events.append([acceptance({ warrantyMonths: null })]);
    const [c] = await opened(h.amc);
    expect(new Date(c.endDate).toISOString().slice(0, 10)).toBe('2027-09-01');
  });

  it('prices at zero — the system knows an AMC is due, it does not presume the price', async () => {
    await h.events.append([acceptance()]);
    const [c] = await opened(h.amc);
    expect(c.value).toBe(0);
  });

  it('is idempotent under event re-delivery — one contract per handover', async () => {
    await h.events.append([acceptance()]);
    await h.events.append([acceptance()]);
    expect(await opened(h.amc)).toHaveLength(1);
    // A different handover on the same project is a different contract.
    await h.events.append([acceptance({}, '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')]);
    expect(await opened(h.amc)).toHaveLength(2);
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
    expect(await opened(h.amc)).toHaveLength(0);
  });
});
