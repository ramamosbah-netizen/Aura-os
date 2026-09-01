import { describe, expect, it } from 'vitest';
import { InMemoryProjectStore } from './in-memory-project-store';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { makeProject } from './domain/project';
import { calculateEvm } from './domain/wbs';
import { WbsService } from './wbs.service';

const tenantId = 'tenant-b7';
const projectId = 'project-b7';
const actorId = 'actor-b7';

function fixture() {
  const projects = new InMemoryProjectStore();
  const wbs = new InMemoryWbsStore();
  const events: { append: (items: unknown[]) => Promise<void> } = { append: async () => undefined };
  const access = { assert: () => undefined };
  const quantity = { position: async () => ({ installed: 0, sold: null }) };
  const tenant = { boundTenantId: () => tenantId };
  const service = new WbsService(wbs, events as never, access as never, quantity as never, undefined, tenant as never, undefined, projects);
  return { projects, wbs, service };
}

async function project(fx: ReturnType<typeof fixture>) {
  await fx.projects.create(makeProject({ tenantId, title: 'B7 project', value: 500_000 }));
  return fx.projects.get(projectId);
}

describe('B7A opening WBS BAC baseline', () => {
  it('captures exact explicit leaf allocations and is replay-idempotent', async () => {
    const fx = fixture();
    await fx.projects.create(makeProject({ tenantId, title: 'B7 project', value: 500_000, reference: projectId }));
    const p = (await fx.projects.list())[0];
    await fx.service.create({ tenantId, projectId: p.id, code: '1.2', title: 'Second', plannedValue: 250 });
    await fx.service.create({ tenantId, projectId: p.id, code: '1.1', title: 'First', plannedValue: 100 });

    const approved = await fx.service.approveOpeningBaseline(p.id, actorId);
    const replay = await fx.service.approveOpeningBaseline(p.id, actorId);
    expect(approved.wbsBaselineId).toBeTruthy();
    expect(replay.wbsBaselineId).toBe(approved.wbsBaselineId);
    expect(approved.wbsBaselineSnapshot?.originalBac).toBe(350);
    expect(approved.wbsBaselineSnapshot?.allocations.map((a) => a.code)).toEqual(['1.1', '1.2']);
    await expect(fx.service.create({ tenantId, projectId: p.id, code: '1.3', title: 'Late', plannedValue: 10 })).rejects.toThrow(/immutable/);
  });

  it('rejects unknown leaf allocations while preserving explicit zero', async () => {
    const unknown = fixture();
    await unknown.projects.create(makeProject({ tenantId, title: 'Unknown', reference: projectId }));
    const p1 = (await unknown.projects.list())[0];
    await unknown.service.create({ tenantId, projectId: p1.id, code: '1.1', title: 'Missing value' });
    await expect(unknown.service.approveOpeningBaseline(p1.id, actorId)).rejects.toThrow(/unknown is not zero/);

    const zero = fixture();
    await zero.projects.create(makeProject({ tenantId, title: 'Known zero', reference: projectId }));
    const p2 = (await zero.projects.list())[0];
    await zero.service.create({ tenantId, projectId: p2.id, code: '1.1', title: 'Zero', plannedValue: 0 });
    const baseline = await zero.service.approveOpeningBaseline(p2.id, actorId);
    expect(baseline.wbsBaselineSnapshot?.originalBac).toBe(0);
  });

  it('uses approved allocations for EV rather than mutable parent/latest values', async () => {
    const fx = fixture();
    await fx.projects.create(makeProject({ tenantId, title: 'EVM', reference: projectId }));
    const p = (await fx.projects.list())[0];
    const a = await fx.service.create({ tenantId, projectId: p.id, code: '1.1', title: 'A', plannedValue: 100 });
    await fx.service.create({ tenantId, projectId: p.id, code: '1.2', title: 'B', plannedValue: 300 });
    await fx.service.approveOpeningBaseline(p.id, actorId);
    await fx.service.updateProgress(a.id, 50, undefined, actorId);
    const evm = await fx.service.getEvmMetrics(p.id);
    expect(evm.budgetAtCompletion).toBe(400);
    expect(evm.plannedValue).toBeNull();
    expect(evm.earnedValue).toBe(50);
    expect(evm.scheduleVariance).toBeNull();
    expect(evm.spi).toBeNull();
    expect(evm.cpi).toBeNull();
  });

  it('does not expose BAC as PV and keeps unavailable ratios explicit', () => {
    const evm = calculateEvm(400, 50, 20, null);
    expect(evm.budgetAtCompletion).toBe(400);
    expect(evm.plannedValue).toBeNull();
    expect(evm.earnedValue).toBe(50);
    expect(evm.actualCost).toBe(20);
    expect(evm.costVariance).toBe(30);
    expect(evm.scheduleVariance).toBeNull();
    expect(evm.cpi).toBe(2.5);
    expect(evm.spi).toBeNull();
    expect(evm.plannedValueStatus).toBe('unavailable');
  });

  it('keeps EVM unavailable before an approved opening baseline', async () => {
    const fx = fixture();
    await fx.projects.create(makeProject({ tenantId, title: 'Unapproved EVM', reference: projectId }));
    const p = (await fx.projects.list())[0];
    await fx.service.create({ tenantId, projectId: p.id, code: '1.1', title: 'Unapproved', plannedValue: 100 });
    const evm = await fx.service.getEvmMetrics(p.id);
    expect(evm.budgetAtCompletion).toBeNull();
    expect(evm.plannedValue).toBeNull();
    expect(evm.earnedValue).toBeNull();
    expect(evm.costVariance).toBeNull();
    expect(evm.scheduleVariance).toBeNull();
    expect(evm.cpi).toBeNull();
    expect(evm.spi).toBeNull();
  });
});
