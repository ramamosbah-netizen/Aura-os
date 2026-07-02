import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryDailyReportStore,
  InMemoryDelayLogStore,
  InMemoryMaterialConsumptionStore,
  InMemorySiteInstructionStore,
  InMemoryLabourAllocationStore,
} from '../in-memory-site-store';
import { SiteService } from '../site.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

// Service-workflow coverage for the labour-by-trade vertical + site-instruction lifecycle.

const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

describe('Labour by trade (service workflow)', () => {
  let svc: SiteService;
  beforeEach(() => {
    svc = new SiteService(
      new InMemoryDailyReportStore(),
      new InMemoryDelayLogStore(),
      new InMemorySiteInstructionStore(),
      new InMemoryMaterialConsumptionStore(),
      new InMemoryLabourAllocationStore(),
      mockEvents,
      mockTx,
      new AccessService(),
    );
  });

  it('rolls allocations up per trade with headcount and man-hours', async () => {
    await svc.createLabourAllocation({ tenantId: 't1', projectId: 'p1', date: '2026-07-01', trade: 'Electrician', headcount: 4, hours: 8 });
    await svc.createLabourAllocation({ tenantId: 't1', projectId: 'p1', date: '2026-07-02', trade: 'Electrician', headcount: 6, hours: 8 });
    await svc.createLabourAllocation({ tenantId: 't1', projectId: 'p1', date: '2026-07-01', trade: 'Mason', headcount: 10, hours: 9 });
    await svc.createLabourAllocation({ tenantId: 't1', projectId: 'p-other', date: '2026-07-01', trade: 'Mason', headcount: 99, hours: 1 });

    const summary = await svc.labourByTrade('t1', 'p1');
    const electricians = summary.find((s) => s.trade === 'Electrician');
    const masons = summary.find((s) => s.trade === 'Mason');
    expect(electricians?.manHours).toBe(4 * 8 + 6 * 8);
    expect(masons?.manHours).toBe(90);
    // other project's allocation must not leak into the roll-up
    expect(summary.reduce((s, t) => s + t.manHours, 0)).toBe(80 + 90);
  });

  it('walks a site instruction through issue → acknowledge → close', async () => {
    const si = await svc.issueSiteInstruction({
      tenantId: 't1',
      projectId: 'p1',
      reference: 'SI-001',
      issuedBy: 'Engineer',
      date: '2026-07-02',
      instruction: 'Protect finished flooring in lobby before scaffold moves.',
    });
    expect(si.status).toBe('open');

    const acked = await svc.acknowledgeSiteInstruction('t1', si.id);
    expect(acked.status).toBe('acknowledged');

    const closed = await svc.closeSiteInstruction('t1', si.id);
    expect(closed.status).toBe('closed');
  });
});
