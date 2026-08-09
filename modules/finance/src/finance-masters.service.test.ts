import { describe, it, expect, vi } from 'vitest';
import { TenantContext, type EventStore } from '@aura/core';
import { BudgetService } from './budget.service';
import { CostCenterService } from './cost-center.service';
import { ProfitCenterService } from './profit-center.service';
import { InMemoryBudgetStore } from './in-memory-budget-store';
import { InMemoryCostCenterStore } from './in-memory-cost-center-store';
import { InMemoryProfitCenterStore } from './in-memory-profit-center-store';
import { makeBudget } from './domain/budget';

/**
 * Service-layer coverage for the three "master + GL-folded report" services, which previously had
 * none. Focus: tenant isolation on the by-id budget paths (get / vsActual / remove / restore) and
 * per-tenant code uniqueness on the cost/profit-centre masters.
 */

const A = 'tenant-a';
const B = 'tenant-b';
const events = () => ({ append: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const emptyStore = { list: vi.fn().mockResolvedValue([]) } as any;
const asA = <T>(t: TenantContext, fn: () => Promise<T>) => t.run({ tenantId: A, companyId: null, actorId: null }, fn);
const asB = <T>(t: TenantContext, fn: () => Promise<T>) => t.run({ tenantId: B, companyId: null, actorId: null }, fn);

const emittedTypes = (append: ReturnType<typeof vi.fn>): string[] =>
  append.mock.calls.flatMap((c) => (c[0] as Array<{ type: string }>).map((e) => e.type));

function budgetHarness() {
  const store = new InMemoryBudgetStore();
  const tenant = new TenantContext();
  const append = vi.fn().mockResolvedValue(undefined);
  const svc = new BudgetService(store, emptyStore, emptyStore, { append } as any, tenant);
  const seedA = async () => {
    const b = makeBudget({
      tenantId: A, name: 'FY26', from: '2026-01-01', to: '2026-12-31',
      lines: [{ accountId: 'acc-1', accountCode: '5000', accountName: 'Materials', amount: 100_000 }],
    });
    await store.save(b);
    return b;
  };
  return { store, svc, tenant, seedA, append };
}

describe('BudgetService — tenant isolation', () => {
  it('get returns null across tenants, the budget to its owner', async () => {
    const { svc, tenant, seedA } = budgetHarness();
    const b = await seedA();
    expect(await asB(tenant, () => svc.get(b.id))).toBeNull();
    expect((await asA(tenant, () => svc.get(b.id)))?.id).toBe(b.id);
  });

  it('vsActual does not disclose another tenant\'s budget or its GL actuals', async () => {
    const { svc, tenant, seedA } = budgetHarness();
    const b = await seedA();
    expect(await asB(tenant, () => svc.vsActual(b.id))).toBeNull();
    expect(await asA(tenant, () => svc.vsActual(b.id))).not.toBeNull();
  });

  it('a second tenant cannot delete another tenant\'s budget; it stays live', async () => {
    const { svc, tenant, seedA } = budgetHarness();
    const b = await seedA();
    await asB(tenant, () => expect(svc.remove(b.id)).rejects.toThrow(/not found/i));
    expect(await asA(tenant, () => svc.get(b.id))).not.toBeNull(); // still there
  });

  it('the owner can delete and restore its own budget', async () => {
    const { svc, tenant, seedA } = budgetHarness();
    const b = await seedA();
    await asA(tenant, () => svc.remove(b.id));
    expect(await asA(tenant, () => svc.get(b.id))).toBeNull(); // hidden
    await asA(tenant, () => svc.restore(b.id));
    expect((await asA(tenant, () => svc.get(b.id)))?.id).toBe(b.id); // back
  });

  it('a second tenant cannot restore another tenant\'s deleted budget (fail-closed no-op)', async () => {
    const { svc, tenant, seedA } = budgetHarness();
    const b = await seedA();
    await asA(tenant, () => svc.remove(b.id));
    await asB(tenant, () => svc.restore(b.id)); // touches no rows
    expect(await asA(tenant, () => svc.get(b.id))).toBeNull(); // still deleted for its owner
  });
});

describe('BudgetService — soft-delete audit trail', () => {
  it('emits a deleted event on remove and a restored event on restore', async () => {
    const { svc, tenant, seedA, append } = budgetHarness();
    const b = await seedA();
    await asA(tenant, () => svc.remove(b.id));
    await asA(tenant, () => svc.restore(b.id));
    const types = emittedTypes(append);
    expect(types).toContain('finance.budget.deleted');
    expect(types).toContain('finance.budget.restored');
  });

  it('a cross-tenant restore no-op announces nothing', async () => {
    const { svc, tenant, seedA, append } = budgetHarness();
    const b = await seedA();
    await asA(tenant, () => svc.remove(b.id));
    append.mockClear();
    await asB(tenant, () => svc.restore(b.id)); // touches no rows
    expect(emittedTypes(append)).not.toContain('finance.budget.restored');
  });
});

describe('makeBudget — no silent coercion', () => {
  it('rejects a non-numeric line amount instead of budgeting it as zero', () => {
    expect(() =>
      makeBudget({
        tenantId: A, name: 'X', from: '2026-01-01', to: '2026-12-31',
        lines: [{ accountId: 'a', accountCode: '5000', accountName: 'M', amount: 'oops' as unknown as number }],
      }),
    ).toThrow(/must be a number/i);
  });

  it('still accepts a legitimate zero line', () => {
    const b = makeBudget({
      tenantId: A, name: 'X', from: '2026-01-01', to: '2026-12-31',
      lines: [{ accountId: 'a', accountCode: '5000', accountName: 'M', amount: 0 }],
    });
    expect(b.lines[0].amount).toBe(0);
  });
});

describe('CostCenterService — code uniqueness & scoping', () => {
  const harness = () => new CostCenterService(new InMemoryCostCenterStore(), emptyStore, events());

  it('creates a cost centre and rejects a duplicate code in the same tenant', async () => {
    const svc = harness();
    await svc.create({ tenantId: A, code: 'CC-100', name: 'Site Ops' });
    await expect(svc.create({ tenantId: A, code: 'CC-100', name: 'Dup' })).rejects.toThrow(/already exists/i);
  });

  it('lets a different tenant reuse the same code (uniqueness is per tenant)', async () => {
    const svc = harness();
    await svc.create({ tenantId: A, code: 'CC-100', name: 'Site Ops' });
    const b = await svc.create({ tenantId: B, code: 'CC-100', name: 'B Ops' });
    expect(b.code).toBe('CC-100');
  });

  it('reports only the acting tenant\'s cost centres', async () => {
    const svc = harness();
    await svc.create({ tenantId: A, code: 'CC-A', name: 'A' });
    await svc.create({ tenantId: B, code: 'CC-B', name: 'B' });
    const report = await svc.report(A);
    const codes = report.lines.map((l) => l.code);
    expect(codes).toContain('CC-A');
    expect(codes).not.toContain('CC-B');
  });
});

describe('ProfitCenterService — code uniqueness & scoping', () => {
  const harness = () => new ProfitCenterService(new InMemoryProfitCenterStore(), emptyStore, events());

  it('creates a profit centre and rejects a duplicate code in the same tenant', async () => {
    const svc = harness();
    await svc.create({ tenantId: A, code: 'PC-1', name: 'North' });
    await expect(svc.create({ tenantId: A, code: 'PC-1', name: 'Dup' })).rejects.toThrow(/already exists/i);
  });

  it('reports only the acting tenant\'s profit centres', async () => {
    const svc = harness();
    await svc.create({ tenantId: A, code: 'PC-A', name: 'A' });
    await svc.create({ tenantId: B, code: 'PC-B', name: 'B' });
    const report = await svc.report(A);
    const codes = report.lines.map((l) => l.code);
    expect(codes).toContain('PC-A');
    expect(codes).not.toContain('PC-B');
  });
});
