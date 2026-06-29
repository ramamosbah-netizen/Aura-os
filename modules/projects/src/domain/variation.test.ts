import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeVariationOrder, variationImpact, type VariationOrder } from './variation';
import { VariationService } from '../variation.service';
import { InMemoryVariationStore } from '../in-memory-variation-store';
import type { ProjectService } from '../project.service';

describe('Variation domain', () => {
  it('signs the amount by type and validates', () => {
    expect(makeVariationOrder({ tenantId: 't1', projectId: 'p1', title: 'Extra lifts', type: 'addition', amount: 50000 }).signedAmount).toBe(50000);
    expect(makeVariationOrder({ tenantId: 't1', projectId: 'p1', title: 'Descope', type: 'omission', amount: 20000 }).signedAmount).toBe(-20000);
    expect(() => makeVariationOrder({ tenantId: 't1', projectId: 'p1', title: 'x', type: 'addition', amount: 0 })).toThrow('amount');
    expect(() => makeVariationOrder({ tenantId: 't1', projectId: 'p1', title: '', type: 'addition', amount: 5 })).toThrow('title');
  });

  it('variationImpact rolls approved variations into the revised value (pending excluded)', () => {
    const vo = (over: Partial<VariationOrder>): VariationOrder => ({ ...makeVariationOrder({ tenantId: 't1', projectId: 'p1', title: 'v', type: 'addition', amount: 100 }), ...over });
    const variations = [
      vo({ type: 'addition', amount: 50000, signedAmount: 50000, status: 'approved' }),
      vo({ type: 'omission', amount: 20000, signedAmount: -20000, status: 'approved' }),
      vo({ type: 'addition', amount: 99999, signedAmount: 99999, status: 'submitted' }), // pending — excluded
    ];
    const i = variationImpact(1_000_000, variations);
    expect(i.approvedAdditions).toBe(50000);
    expect(i.approvedOmissions).toBe(20000);
    expect(i.netVariation).toBe(30000);
    expect(i.revisedValue).toBe(1_030_000);
    expect(i.approvedCount).toBe(2);
    expect(i.pendingCount).toBe(1);
  });
});

describe('VariationService', () => {
  const build = () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    const projects = { get: async () => ({ id: 'p1', title: 'Tower A', value: 1_000_000 }) } as unknown as ProjectService;
    return new VariationService(new InMemoryVariationStore(), events, projects, access);
  };

  it('creates, approves (stamps decided), and rolls up the revised value', async () => {
    const svc = build();
    const vo = await svc.create({ tenantId: 't1', projectId: 'p1', title: 'Extra MEP', type: 'addition', amount: 80000, createdBy: 'u1' });
    expect(vo.status).toBe('draft');

    const approved = await svc.changeStatus(vo.id, 'approved', 'mgr');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('mgr');
    expect(approved.decidedAt).toBeTruthy();

    const summary = await svc.getProjectSummary('t1', 'p1');
    expect(summary.impact.revisedValue).toBe(1_080_000);
    expect(summary.impact.approvedCount).toBe(1);
  });
});
