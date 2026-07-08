import { describe, it, expect } from 'vitest';
import { ApprovalMatrixService, type ApprovalRule } from './approval-matrix.service';

const svc = (): ApprovalMatrixService => new ApprovalMatrixService(); // no pool → in-memory

const rules: ApprovalRule[] = [
  { id: 'high', label: 'Over 50k → CFO', conditions: [{ field: 'value', operator: 'gt', value: 50000 }], approvers: ['u-cfo'], minApprovals: 1, order: 2 },
  { id: 'any', label: 'Default → manager', conditions: [], approvers: ['u-mgr'], minApprovals: 1, order: 1 },
];

describe('ApprovalMatrixService', () => {
  it('round-trips a config and returns rules sorted by order', async () => {
    const s = svc();
    await s.configure({ tenantId: 't1', entityType: 'purchase-order', rules });
    const cfg = await s.getConfig('t1', 'purchase-order');
    expect(cfg?.rules.map((r) => r.id)).toEqual(['any', 'high']); // order 1 then 2
  });

  it('returns null for an unconfigured entity type', async () => {
    expect(await svc().getConfig('t1', 'nope')).toBeNull();
  });

  it('resolve picks the first matching rule by priority', async () => {
    const s = svc();
    await s.configure({ tenantId: 't1', entityType: 'purchase-order', rules });
    const big = await s.resolve('t1', 'purchase-order', { value: 90000 });
    // 'any' (order 1, no conditions) matches first — the default catch-all wins by priority.
    expect(big?.ruleId).toBe('any');
    expect(big?.approvers).toEqual(['u-mgr']);
  });
});
