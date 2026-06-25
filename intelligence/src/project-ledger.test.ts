import { describe, expect, it } from 'vitest';
import { type DomainEvent, makeEvent } from '@aura/shared';
import { foldProjectLedgers, isLedgerEvent } from './project-ledger';

function projectCreated(id: string, value: number, title: string, account: string): DomainEvent {
  return makeEvent({
    type: 'projects.project.created',
    tenantId: 't1',
    aggregateType: 'projects.project',
    aggregateId: id,
    payload: { title, value, account: { id: 'a1', name: account } },
  });
}

function spend(type: string, projectId: string, projectName: string, value: number): DomainEvent {
  return makeEvent({
    type,
    tenantId: 't1',
    aggregateType: 'x',
    aggregateId: 'agg',
    payload: { value, project: { id: projectId, name: projectName } },
  });
}

describe('intelligence project ledger', () => {
  it('folds budget (project value) vs committed/received/invoiced spend per project', () => {
    const ledgers = foldProjectLedgers([
      projectCreated('p1', 100000, 'Metro Depot', 'Globex MEP'),
      spend('procurement.po.created', 'p1', 'Metro Depot', 60000),
      spend('inventory.grn.created', 'p1', 'Metro Depot', 50000),
      spend('finance.invoice.created', 'p1', 'Metro Depot', 40000),
    ]);
    expect(ledgers).toHaveLength(1);
    const l = ledgers[0];
    expect(l.projectId).toBe('p1');
    expect(l.projectName).toBe('Metro Depot');
    expect(l.accountName).toBe('Globex MEP');
    expect(l.budget).toBe(100000);
    expect(l.committed).toBe(60000);
    expect(l.received).toBe(50000);
    expect(l.invoiced).toBe(40000);
    expect(l.variance).toBe(60000); // budget - invoiced, under budget
  });

  it('flags over-budget projects with a negative variance', () => {
    const ledgers = foldProjectLedgers([
      projectCreated('p1', 50000, 'Tower', 'Acme'),
      spend('finance.invoice.created', 'p1', 'Tower', 70000),
    ]);
    expect(ledgers[0].variance).toBe(-20000);
  });

  it('tracks spend even if the project event has not been seen, and sorts by budget desc', () => {
    const ledgers = foldProjectLedgers([
      spend('procurement.po.created', 'p2', 'Orphan Spend', 30000),
      projectCreated('p1', 200000, 'Big', 'Acme'),
    ]);
    expect(ledgers.map((l) => l.projectId)).toEqual(['p1', 'p2']); // 200000 before 0-budget
    const orphan = ledgers.find((l) => l.projectId === 'p2');
    expect(orphan?.budget).toBe(0);
    expect(orphan?.committed).toBe(30000);
    expect(orphan?.projectName).toBe('Orphan Spend');
  });

  it('ignores unrelated events and spend with no project reference', () => {
    const ledgers = foldProjectLedgers([
      makeEvent({ type: 'crm.account.created', tenantId: 't1', aggregateType: 'crm.account', aggregateId: 'a', payload: { name: 'X' } }),
      makeEvent({ type: 'procurement.po.created', tenantId: 't1', aggregateType: 'x', aggregateId: 'b', payload: { value: 999, project: null } }),
    ]);
    expect(ledgers).toHaveLength(0);
  });

  it('recognizes which event types feed the ledger', () => {
    expect(isLedgerEvent('finance.invoice.created')).toBe(true);
    expect(isLedgerEvent('crm.account.created')).toBe(false);
  });
});
