import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { OpportunityDepthService } from './opportunity-depth.service';
import { InMemoryOpportunityDepthStore } from './in-memory-opportunity-depth-store';

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const svc = new OpportunityDepthService(new InMemoryOpportunityDepthStore(), events);
  return { svc, events };
}

describe('OpportunityDepthService', () => {
  it('builds the buying committee and closes coverage gaps as roles are mapped', async () => {
    const { svc } = harness();
    const before = await svc.depthFor('t1', 'o1');
    expect(before.coverage.gaps).toContain('NO_STAKEHOLDERS');

    await svc.addStakeholder({ tenantId: 't1', opportunityId: 'o1', contactName: 'Dana', role: 'DECISION_MAKER' });
    await svc.addStakeholder({ tenantId: 't1', opportunityId: 'o1', contactName: 'Omar', role: 'ECONOMIC_BUYER' });
    await svc.addStakeholder({ tenantId: 't1', opportunityId: 'o1', contactName: 'Sara', role: 'CHAMPION', isChampion: true });

    const after = await svc.depthFor('t1', 'o1');
    expect(after.stakeholders.length).toBe(3);
    expect(after.coverage.gaps).toEqual([]);
    expect(after.coverage.score).toBe(100);
  });

  it('scopes children to their opportunity', async () => {
    const { svc } = harness();
    await svc.addStakeholder({ tenantId: 't1', opportunityId: 'o1', contactName: 'A' });
    await svc.addStakeholder({ tenantId: 't1', opportunityId: 'o2', contactName: 'B' });
    expect((await svc.listStakeholders('t1', 'o1')).length).toBe(1);
  });

  it('adds a deal team member and emits', async () => {
    const { svc, events } = harness();
    const m = await svc.addDealMember({ tenantId: 't1', opportunityId: 'o1', userId: 'u5', role: 'PRESALES' });
    expect(m.active).toBe(true);
    expect(events.append).toHaveBeenCalled();
    expect((await svc.listDealTeam('t1', 'o1')).length).toBe(1);
  });

  it('tracks commitments through fulfil, and surfaces overdue in the summary', async () => {
    const { svc } = harness();
    await svc.addCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'OURS', description: 'Send revised quote', dueAt: '2000-01-01' });
    const c2 = await svc.addCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'THEIRS', description: 'Send drawings' });

    let depth = await svc.depthFor('t1', 'o1');
    expect(depth.commitmentSummary.open).toBe(2);
    expect(depth.commitmentSummary.overdue).toBe(1); // the 2000-01-01 one
    expect(depth.commitmentSummary.needsAttention).toBe(true);

    await svc.fulfilCommitment(c2.id, 'received');
    depth = await svc.depthFor('t1', 'o1');
    expect(depth.commitmentSummary.fulfilled).toBe(1);
    expect(depth.commitmentSummary.open).toBe(1);
  });

  it('cannot fulfil a commitment twice', async () => {
    const { svc } = harness();
    const c = await svc.addCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'OURS', description: 'x' });
    await svc.fulfilCommitment(c.id);
    await expect(svc.fulfilCommitment(c.id)).rejects.toThrow();
  });

  it('logs decisions/assumptions/questions and surfaces risk when one is invalidated', async () => {
    const { svc } = harness();
    await svc.addRegisterItem({ tenantId: 't1', relatedId: 'o1', kind: 'DECISION', statement: 'Use Hikvision' });
    const assumption = await svc.addRegisterItem({ tenantId: 't1', relatedId: 'o1', kind: 'ASSUMPTION', statement: 'Reuse fiber', confidence: 60 });
    await svc.addRegisterItem({ tenantId: 't1', relatedId: 'o1', kind: 'OPEN_QUESTION', statement: 'Who signs off?' });

    let depth = await svc.depthFor('t1', 'o1');
    expect(depth.register.length).toBe(3);
    expect(depth.registerSummary).toMatchObject({ decisions: 1, assumptions: 1, openQuestions: 1, open: 3 });
    expect(depth.registerSummary.needsAttention).toBe(false);

    // The fiber assumption proves false → material deal risk.
    await svc.resolveRegisterItem(assumption.id, 'INVALIDATED', 'survey found no spare fiber');
    depth = await svc.depthFor('t1', 'o1');
    expect(depth.registerSummary.invalidatedAssumptions).toBe(1);
    expect(depth.registerSummary.needsAttention).toBe(true);
  });

  it('rejects an invalid register resolution for the kind', async () => {
    const { svc } = harness();
    const q = await svc.addRegisterItem({ tenantId: 't1', relatedId: 'o1', kind: 'OPEN_QUESTION', statement: 'x' });
    await expect(svc.resolveRegisterItem(q.id, 'VALIDATED')).rejects.toThrow();
  });
});
