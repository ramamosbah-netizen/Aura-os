import { describe, it, expect } from 'vitest';
import { makeCostCenter, buildCostCenterReport, type CostCenter } from './cost-center';

const cc = (id: string, code: string): CostCenter => ({
  id, tenantId: 't1', companyId: null, code, name: `CC ${code}`, active: true, createdAt: '2026-01-01T00:00:00Z', createdBy: null,
});

describe('cost-center domain', () => {
  it('validates code + name', () => {
    expect(() => makeCostCenter({ tenantId: 't1', code: '', name: 'x' })).toThrow('code is required');
    expect(() => makeCostCenter({ tenantId: 't1', code: 'A', name: '' })).toThrow('name is required');
    const c = makeCostCenter({ tenantId: 't1', code: 'OPS', name: 'Operations' });
    expect(c.active).toBe(true);
    expect(c.code).toBe('OPS');
  });

  it('folds GL lines by cost-centre tag; untagged → unallocated', () => {
    const centers = [cc('c1', 'A'), cc('c2', 'B')];
    const lines = [
      { debit: 1000, credit: 0, costCenterId: 'c1' },
      { debit: 0, credit: 200, costCenterId: 'c1' },
      { debit: 500, credit: 0, costCenterId: 'c2' },
      { debit: 300, credit: 0, costCenterId: null }, // unallocated
    ];
    const r = buildCostCenterReport(centers, lines);
    const a = r.lines.find((l) => l.code === 'A')!;
    expect(a.debit).toBe(1000);
    expect(a.credit).toBe(200);
    expect(a.net).toBe(800);
    expect(r.lines.find((l) => l.code === 'B')!.net).toBe(500);
    expect(r.unallocated.net).toBe(300);
    expect(r.grandNet).toBe(1600); // 800 + 500 + 300
  });

  it('empty centre with no lines nets zero', () => {
    const r = buildCostCenterReport([cc('c1', 'A')], []);
    expect(r.lines[0].net).toBe(0);
    expect(r.grandNet).toBe(0);
  });
});
