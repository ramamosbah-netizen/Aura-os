import { describe, expect, it, vi } from 'vitest';
import { makeCostTransaction, type NewCostTransaction } from './domain/cost-transaction';
import { actualByWorkPackage } from './domain/cost-actuals';
import { resolveActivityCosts } from './domain/activity-cost';
import { CostLedgerService } from './cost-ledger.service';
import { InMemoryCostLedgerStore } from './in-memory-cost-ledger-store';
import { ProjectHealthService } from './project-health.service';
import type { CbsService } from './cbs.service';

/**
 * F-07 — THE WBS IDENTITY CONTINUED INTO COST.
 *
 * Every cost source posted to a CBS line only, so a work package's actual cost was zero whatever was
 * spent on it, project EVM read AC from those zeros (CV = the whole earned value), and project health
 * called cost performance "unknown — nothing posted" on a project with posted cost. These pin the
 * reads that replace it: package cost from the ledger, the unattributed remainder beside it, and the
 * project's actual cost as the ledger's TOTAL.
 */
const tenantId = 't-f07';
const projectId = 'p-f07';
const txn = (over: Partial<NewCostTransaction>) =>
  makeCostTransaction({ tenantId, projectId, type: 'actual', amount: 0, source: 'labour_timesheet', ...over } as NewCostTransaction);

describe('actual cost by work package — from the ledger, with the remainder', () => {
  const ledger = [
    txn({ wbsNodeId: 'wp-1', amount: 1200 }),                                 // labour on the package
    txn({ wbsNodeId: 'wp-1', amount: 300, source: 'material_issue' }),        // material issued to it
    txn({ wbsNodeId: 'wp-1', amount: -50, source: 'material_return' }),       // part of it returned
    txn({ wbsNodeId: null, amount: 800, source: 'plant_usage' }),             // plant names no package
    txn({ wbsNodeId: 'another-projects-wp', amount: 40 }),                     // not one of ours
    txn({ type: 'committed', wbsNodeId: 'wp-1', amount: 9999, source: 'po' }), // a commitment is not a cost yet
    txn({ wbsNodeId: 'wp-2', amount: 100, sourceCurrency: 'USD', baseCurrency: 'AED', baseAmount: null }), // no FX
  ];

  it('attributes what named one of the project packages, keeps the rest as unattributed, and totals both', () => {
    const out = actualByWorkPackage(ledger, ['wp-1', 'wp-2']);
    expect(out.byPackage).toEqual({ 'wp-1': { amount: 1450, postings: 3 } });
    expect(out.unattributed).toEqual({ amount: 840, postings: 2 });
    expect(out.total, 'the project actual is everything countable, attributed or not').toBe(2290);
    expect(out.unknownProvenance, 'a cross-currency posting with no base amount is left out and COUNTED').toBe(1);
  });

  it('gives each activity its package figure, says who shares it, and never turns unknown into zero', () => {
    const actuals = actualByWorkPackage(ledger, ['wp-1', 'wp-2', 'wp-3']);
    const tasks = [
      { id: 'a1', wbsNodeId: 'wp-1' }, { id: 'a2', wbsNodeId: 'wp-1' },
      { id: 'a3', wbsNodeId: 'wp-3' }, { id: 'legacy', wbsNodeId: null },
    ];
    const packages = [
      { id: 'wp-1', plannedValue: 5000, plannedValueKnown: true },
      { id: 'wp-3', plannedValue: 0, plannedValueKnown: false },
    ];
    const { byTask, coverage } = resolveActivityCosts(tasks, packages, actuals);
    expect(byTask.get('a1')).toEqual({ wbsNodeId: 'wp-1', packageActual: 1450, packagePostings: 3, packageBudget: 5000, sharedBy: 2 });
    expect(byTask.get('a2')?.packageActual, 'two activities on one package show ITS cost, not a share each').toBe(1450);
    expect(byTask.get('a3')).toMatchObject({ packageActual: 0, packagePostings: 0, packageBudget: null, sharedBy: 1 });
    expect(byTask.get('legacy')).toMatchObject({ packageActual: null, sharedBy: 0 });
    expect(coverage).toEqual({ projectActual: 2290, unattributedActual: 840, unattributedPostings: 2, unknownProvenance: 1 });

    const unbound = resolveActivityCosts(tasks, packages, null);
    expect(unbound.byTask.get('a1')?.packageActual, 'no ledger bound: unknown, not zero').toBeNull();
    expect(unbound.coverage.projectActual).toBeNull();
  });
});

describe('the Cost Ledger service', () => {
  const cbs = { list: vi.fn(async () => []), reconcileActualProjection: vi.fn(), recordCommittedCost: vi.fn() } as unknown as CbsService;

  it('reads a project by work package through the same rule as the projection rebuild', async () => {
    const store = new InMemoryCostLedgerStore();
    const svc = new CostLedgerService(store, cbs);
    await svc.post({ tenantId, projectId, cbsNodeId: 'cbs-l', wbsNodeId: 'wp-1', type: 'actual', amount: 700, source: 'labour_timesheet' });
    await svc.post({ tenantId, projectId, cbsNodeId: 'cbs-p', type: 'actual', amount: 250, source: 'plant_usage' });
    expect(await svc.actualByWorkPackage(tenantId, projectId, ['wp-1'])).toMatchObject({
      total: 950, byPackage: { 'wp-1': { amount: 700, postings: 1 } }, unattributed: { amount: 250, postings: 1 },
    });
  });

  it('a replay that now carries a package does not jam on a fact posted before packages were carried', async () => {
    const store = new InMemoryCostLedgerStore();
    const svc = new CostLedgerService(store, cbs);
    const before = { tenantId, projectId, cbsNodeId: 'cbs-l', type: 'actual' as const, amount: 700, source: 'labour_timesheet' as const, dedupeKey: 'labour:evt-9' };
    const first = await svc.post(before);
    const replay = await svc.post({ ...before, wbsNodeId: 'wp-1' });
    expect(replay.id, 'the append-only first fact stands').toBe(first.id);
    expect(replay.wbsNodeId, 'and stays unattributed rather than being rewritten').toBeNull();
    expect(await store.list({ tenantId })).toHaveLength(1);
    // A real disagreement is still a conflict: one package on file, a different one now.
    await svc.post({ ...before, dedupeKey: 'labour:evt-10', wbsNodeId: 'wp-1' });
    await expect(svc.post({ ...before, dedupeKey: 'labour:evt-10', wbsNodeId: 'wp-2' })).rejects.toThrow(/dedupe conflict/);
  });
});

describe('project health reads actual cost from the ledger, and counts each package once', () => {
  const build = (nodes: object[], ledger: InMemoryCostLedgerStore | null) => new ProjectHealthService(
    { list: async () => nodes as never } as never,
    { list: async () => [] } as never, { list: async () => [] } as never, { list: async () => [] } as never,
    null, null, null, null, null, ledger as never,
  );
  const cpiOf = async (svc: ProjectHealthService) =>
    (await svc.assess(tenantId, projectId)).signals.find((s) => s.id === 'cost-performance');

  it('was UNKNOWN on a project with posted cost, because the package columns held none — now it measures', async () => {
    const nodes = [{ id: 'wp-1', parentId: null, plannedValue: 1000, earnedValue: 500, actualCost: 0 }];
    expect(await cpiOf(build(nodes, null)), 'the projection alone: nothing attributed, so no index').toMatchObject({ state: 'UNKNOWN' });

    const ledger = new InMemoryCostLedgerStore();
    await ledger.append(txn({ wbsNodeId: null, amount: 800, source: 'plant_usage' }));   // unattributed, still cost
    await ledger.append(txn({ wbsNodeId: 'wp-1', amount: 200 }));
    // CPI = 500 / 1000 = 0.5 — measured against EVERYTHING spent, not the 200 that named the package.
    expect(await cpiOf(build(nodes, ledger))).toMatchObject({ state: 'AT_RISK', measure: { value: 0.5 } });
  });

  it('a parent and its children are one package tree, not three packages', async () => {
    const nodes = [
      { id: 'root', parentId: null, plannedValue: 1000, earnedValue: 400, actualCost: 0 },
      { id: 'c1', parentId: 'root', plannedValue: 600, earnedValue: 300, actualCost: 0 },
      { id: 'c2', parentId: 'root', plannedValue: 400, earnedValue: 100, actualCost: 0 },
    ];
    const ledger = new InMemoryCostLedgerStore();
    await ledger.append(txn({ wbsNodeId: 'c1', amount: 400 }));
    // EV counted once (400, the root's roll-up) against AC 400 → CPI 1.0. Summing every level made
    // it 800 / 400 = 2.0 and reported a project spending exactly its earned value as far under budget.
    expect(await cpiOf(build(nodes, ledger))).toMatchObject({ state: 'CLEAR' });
  });
});

describe('project EVM reads AC from the ledger', () => {
  it('CV is earned value minus EVERYTHING spent — not minus the part that named a package', async () => {
    const { InMemoryProjectStore } = await import('./in-memory-project-store');
    const { InMemoryWbsStore } = await import('./in-memory-wbs-store');
    const { makeProject } = await import('./domain/project');
    const { WbsService } = await import('./wbs.service');
    const projects = new InMemoryProjectStore();
    const ledger = new InMemoryCostLedgerStore();
    const service = new WbsService(
      new InMemoryWbsStore(), { append: async () => undefined } as never, { assert: () => undefined } as never,
      { position: async () => ({ installed: 0, sold: null }) } as never, undefined, { boundTenantId: () => tenantId } as never,
      undefined, projects, ledger,
    );
    await projects.create(makeProject({ tenantId, title: 'F-07 EVM', value: 10_000 }));
    const p = (await projects.list())[0];
    const a = await service.create({ tenantId, projectId: p.id, code: '1.1', title: 'Cabling', plannedValue: 1000 });
    await service.approveOpeningBaseline(p.id, 'u-pm');
    await service.updateProgress(a.id, 50, undefined, 'u-pm');
    await ledger.append(makeCostTransaction({ tenantId, projectId: p.id, wbsNodeId: a.id, type: 'actual', amount: 300, source: 'labour_timesheet' }));
    await ledger.append(makeCostTransaction({ tenantId, projectId: p.id, type: 'actual', amount: 400, source: 'plant_usage' }));
    const evm = await service.getEvmMetrics(p.id);
    expect(evm).toMatchObject({ earnedValue: 500, actualCost: 700, costVariance: -200 });
  });
});
