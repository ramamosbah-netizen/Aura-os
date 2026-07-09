import { describe, it, expect } from 'vitest';
import {
  InMemoryDailyReportStore,
  InMemoryDelayLogStore,
  InMemoryMaterialConsumptionStore,
  InMemorySiteInstructionStore,
  InMemoryLabourAllocationStore,
} from '../in-memory-site-store';
import { SiteService } from '../site.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

// Coverage for the site verticals the QA volume flags as thin: the daily-report
// submit transition, the delay-log lifecycle (EOT evidence), and material
// consumption — each with the event the transition must append.

const mockTx: TxRunner = { run: (fn) => fn(null) };

function build(): { svc: SiteService; emitted: Array<{ type: string; payload: Record<string, unknown> }> } {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    appendWithClient: async (_h: unknown, evts: Array<{ type: string; payload: Record<string, unknown> }>) => {
      emitted.push(...evts);
      return evts;
    },
  } as unknown as EventStore;
  const svc = new SiteService(
    new InMemoryDailyReportStore(),
    new InMemoryDelayLogStore(),
    new InMemoryMaterialConsumptionStore(),
    new InMemorySiteInstructionStore(),
    new InMemoryLabourAllocationStore(),
    events,
    mockTx,
    new AccessService(),
  );
  return { svc, emitted };
}

describe('Daily report submit transition', () => {
  it('drafts then submits, emitting site.daily_report.submitted with the manpower payload', async () => {
    const { svc, emitted } = build();
    const report = await svc.createDailyReport({
      tenantId: 't1', projectId: 'p1', date: '2026-07-09',
      workDescription: 'Second fix electrical, L2 west wing', manpowerCount: 12,
    });
    expect(report.status).toBe('draft');
    expect(emitted).toHaveLength(0); // drafting is not an announced business fact

    const submitted = await svc.submitDailyReport('t1', null, report.id);
    expect(submitted.status).toBe('submitted');
    const evt = emitted.find((e) => e.type === 'site.daily_report.submitted');
    expect(evt?.payload).toMatchObject({ date: '2026-07-09', projectId: 'p1', manpowerCount: 12 });
  });

  it('is tenant-isolated on submit', async () => {
    const { svc } = build();
    const report = await svc.createDailyReport({
      tenantId: 't1', projectId: 'p1', date: '2026-07-09', workDescription: 'x',
    });
    await expect(svc.submitDailyReport('t2', null, report.id)).rejects.toThrow(/not found/);
  });
});

describe('Delay log lifecycle (EOT evidence)', () => {
  it('logs a delay (site.delay.logged with impact hours) and resolves it', async () => {
    const { svc, emitted } = build();
    const delay = await svc.createDelayLog({
      tenantId: 't1', projectId: 'p1', date: '2026-07-08',
      delayType: 'drawings', description: 'Late drawing approval blocked slab pour', impactHours: 16,
    });
    expect(delay.status).not.toBe('resolved');
    expect(delay.resolvedAt ?? null).toBeNull();
    const logged = emitted.find((e) => e.type.startsWith('site.delay'));
    expect(logged?.payload).toMatchObject({ delayType: 'drawings', impactHours: 16, projectId: 'p1' });

    const resolved = await svc.resolveDelayLog('t1', null, delay.id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it('windows the paged delay list (gap #9 tail behavior)', async () => {
    const { svc } = build();
    for (let i = 1; i <= 5; i++) {
      await svc.createDelayLog({
        tenantId: 't1', projectId: 'p1', date: `2026-07-0${i}`,
        delayType: 'weather', description: `Sandstorm day ${i}`,
      });
    }
    const page = await svc.listDelayLogsPaged('t1', { offset: 2, limit: 2 });
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(2);
    expect(page.offset).toBe(2);
  });
});

describe('Material consumption', () => {
  it('logs consumption with the inventory-facing event payload', async () => {
    const { svc, emitted } = build();
    const row = await svc.createMaterialConsumption({
      tenantId: 't1', projectId: 'p1', date: '2026-07-09',
      itemId: 'itm-cu-25', itemName: 'Copper cable 25mm', quantityConsumed: 180, unit: 'm',
    });
    expect(row.quantityConsumed).toBe(180);
    const evt = emitted.find((e) => e.type.includes('material'));
    expect(evt?.payload).toMatchObject({ itemId: 'itm-cu-25', quantityConsumed: 180, unit: 'm' });
    expect(await svc.listMaterialConsumption('t2')).toHaveLength(0);
  });
});
