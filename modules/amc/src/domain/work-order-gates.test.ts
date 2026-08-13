import { describe, it, expect } from 'vitest';
import { InMemoryAmcStore } from '../in-memory-amc-store';
import { AmcService } from '../amc.service';
import type { EventStore } from '@aura/core';
import {
  WORK_ORDER_TRANSITIONS,
  canTransitionWorkOrder,
  WorkOrder,
} from './work-order';

// G-08 residue (amc). Covers the refusals that make the work order a record of a visit that
// actually happened, rather than a status field: the contract gate, the lifecycle guards, and the
// SLA outcome stamped at completion.

const noEvents = { append: async () => [] } as unknown as EventStore;
const build = (): { svc: AmcService; store: InMemoryAmcStore } => {
  const store = new InMemoryAmcStore();
  return { svc: new AmcService(store, noEvents), store };
};

const DAY = 86_400_000;

async function activeContract(svc: AmcService, over: Record<string, unknown> = {}) {
  return svc.createContract({
    tenantId: 't1',
    contractNumber: 'AMC-1',
    clientName: 'Emaar',
    serviceScope: 'ELV maintenance',
    startDate: new Date(Date.now() - 30 * DAY),
    endDate: new Date(Date.now() + 30 * DAY),
    value: 100_000,
    slaResolutionHours: 24,
    ...over,
  });
}

describe('work order state machine', () => {
  it('refuses completion straight from open — nobody was ever assigned', () => {
    expect(canTransitionWorkOrder('open', 'completed')).toBe(false);
    expect(canTransitionWorkOrder('open', 'assigned')).toBe(true);
  });

  it('allows completion from assigned as well as in_progress', () => {
    expect(canTransitionWorkOrder('assigned', 'completed')).toBe(true);
    expect(canTransitionWorkOrder('in_progress', 'completed')).toBe(true);
  });

  it('makes completed and cancelled terminal', () => {
    expect(WORK_ORDER_TRANSITIONS.completed).toEqual([]);
    expect(WORK_ORDER_TRANSITIONS.cancelled).toEqual([]);
  });

  it('requires a technician to assign', () => {
    const wo = new WorkOrder({ id: 'w1', tenantId: 't1', orderNumber: 'WO-1', description: 'x' });
    expect(() => wo.assign('  ')).toThrow(/technician is required/);
  });
});

describe('contract gate', () => {
  it('refuses a work order against a terminated contract', async () => {
    const { svc } = build();
    const contract = await activeContract(svc);
    await svc.terminateContract(contract.id);

    await expect(
      svc.createWorkOrder({ tenantId: 't1', contractId: contract.id, orderNumber: 'WO-1', description: 'Call-out' }),
    ).rejects.toThrow(/can only be raised against an active service contract/);
  });

  it('refuses a work order against an expired contract', async () => {
    const { svc } = build();
    const expired = await activeContract(svc, {
      contractNumber: 'AMC-OLD',
      startDate: new Date(Date.now() - 400 * DAY),
      endDate: new Date(Date.now() - 10 * DAY),
    });

    await expect(
      svc.createWorkOrder({ tenantId: 't1', contractId: expired.id, orderNumber: 'WO-2', description: 'Call-out' }),
    ).rejects.toThrow(/can only be raised against an active service contract/);
  });

  it('allows an ad-hoc work order with no contract at all', async () => {
    const { svc } = build();
    const wo = await svc.createWorkOrder({ tenantId: 't1', orderNumber: 'WO-ADHOC', description: 'Goodwill visit' });
    expect(wo.status).toBe('open');
  });

  it('refuses a work order citing a contract that does not exist', async () => {
    const { svc } = build();
    await expect(
      svc.createWorkOrder({ tenantId: 't1', contractId: 'nope', orderNumber: 'WO-3', description: 'x' }),
    ).rejects.toThrow(/not found/);
  });
});

describe('SLA outcome at completion', () => {
  it('stamps the contract SLA, the measured hours, and whether it was met', async () => {
    const { svc, store } = build();
    const contract = await activeContract(svc, { slaResolutionHours: 24 });
    const wo = await svc.createWorkOrder({
      tenantId: 't1', contractId: contract.id, orderNumber: 'WO-SLA', description: 'Compressor',
    });

    await svc.assignWorkOrder(wo.id, 'tech-1');
    await svc.completeWorkOrder(wo.id, 1500);

    const done = await store.findWorkOrder(wo.id);
    expect(done?.status).toBe('completed');
    expect(done?.cost).toBe(1500);
    expect(done?.slaResolutionHours).toBe(24);
    expect(done?.resolutionHours).toBeGreaterThanOrEqual(0);
    expect(done?.slaMet).toBe(true); // completed immediately, well inside 24h
  });

  it('records a breach when the visit ran past the contract window', async () => {
    const { svc } = build();
    const contract = await activeContract(svc, { slaResolutionHours: 4 });
    const wo = await svc.createWorkOrder({
      tenantId: 't1', contractId: contract.id, orderNumber: 'WO-LATE', description: 'Late job',
    });
    wo.assign('tech-2');
    // Backdate the raise so the elapsed time exceeds the 4h window.
    Object.assign(wo, { createdAt: new Date(Date.now() - 9 * 3_600_000) });

    wo.complete(200, contract.slaResolutionHours);
    expect(wo.slaMet).toBe(false);
    expect(wo.resolutionHours).toBeGreaterThan(4);
  });

  it('leaves the outcome unmeasured for an ad-hoc order with no contract', async () => {
    const { svc, store } = build();
    const wo = await svc.createWorkOrder({ tenantId: 't1', orderNumber: 'WO-NC', description: 'No contract' });
    await svc.assignWorkOrder(wo.id, 'tech-3');
    await svc.completeWorkOrder(wo.id, 100);

    const done = await store.findWorkOrder(wo.id);
    // null/undefined reads as "not measured", never as "missed".
    expect(done?.slaMet).toBeUndefined();
  });

  it('refuses to complete twice', async () => {
    const { svc } = build();
    const wo = await svc.createWorkOrder({ tenantId: 't1', orderNumber: 'WO-DUP', description: 'x' });
    await svc.assignWorkOrder(wo.id, 'tech-4');
    await svc.completeWorkOrder(wo.id, 10);
    await expect(svc.completeWorkOrder(wo.id, 10)).rejects.toThrow(/can only advance/);
  });

  it('refuses to complete an unassigned order', async () => {
    const { svc } = build();
    const wo = await svc.createWorkOrder({ tenantId: 't1', orderNumber: 'WO-UNASSIGNED', description: 'x' });
    await expect(svc.completeWorkOrder(wo.id)).rejects.toThrow(/can only advance/);
  });
});

describe('PPM generation respects the contract gate', () => {
  it('does not mint preventive visits under a terminated contract', async () => {
    const { svc } = build();
    const contract = await activeContract(svc, { contractNumber: 'AMC-PPM' });
    await svc.createPpmSchedule({
      tenantId: 't1',
      contractId: contract.id,
      taskDescription: 'Quarterly filter change',
      frequency: 'monthly',
      startDate: new Date(Date.now() - 2 * DAY),
    });

    // Due now — while the contract is live it generates.
    expect(await svc.generateDueVisits('t1')).toHaveLength(1);

    await svc.terminateContract(contract.id);
    // Still due, but the contract is dead: the sweep must not keep billing against it.
    expect(await svc.generateDueVisits('t1')).toHaveLength(0);
  });
});
