import { describe, it, expect } from 'vitest';
import {
  makeRegisterItem, resolveRegisterItem, registerSummary, REGISTER_TERMINALS,
} from './deal-register';

const item = (over: Parameters<typeof makeRegisterItem>[0]) => makeRegisterItem({ tenantId: 't1', relatedId: 'o1', ...over });

describe('makeRegisterItem', () => {
  it('starts OPEN; confidence only kept for assumptions', () => {
    const a = item({ kind: 'ASSUMPTION', statement: 'Fiber can be reused', confidence: 60 });
    expect(a.status).toBe('OPEN');
    expect(a.confidence).toBe(60);
    const d = item({ kind: 'DECISION', statement: 'Use Hikvision', confidence: 90 });
    expect(d.confidence).toBeNull(); // confidence is meaningless on a decision
  });
  it('clamps assumption confidence', () => {
    expect(item({ kind: 'ASSUMPTION', statement: 'x', confidence: 250 }).confidence).toBe(100);
  });
});

describe('resolveRegisterItem', () => {
  it('DECISION resolves only to DECIDED', () => {
    const d = resolveRegisterItem(item({ kind: 'DECISION', statement: 'x' }), 'DECIDED', 'agreed in review', 'u1');
    expect(d.status).toBe('DECIDED');
    expect(d.resolvedBy).toBe('u1');
    expect(d.detail).toBe('agreed in review');
  });
  it('ASSUMPTION can be VALIDATED or INVALIDATED', () => {
    expect(resolveRegisterItem(item({ kind: 'ASSUMPTION', statement: 'x' }), 'VALIDATED').status).toBe('VALIDATED');
    expect(resolveRegisterItem(item({ kind: 'ASSUMPTION', statement: 'x' }), 'INVALIDATED').status).toBe('INVALIDATED');
  });
  it('OPEN_QUESTION resolves to RESOLVED', () => {
    expect(resolveRegisterItem(item({ kind: 'OPEN_QUESTION', statement: 'who signs?' }), 'RESOLVED').status).toBe('RESOLVED');
  });
  it('rejects an invalid terminal for the kind', () => {
    expect(() => resolveRegisterItem(item({ kind: 'DECISION', statement: 'x' }), 'RESOLVED')).toThrow(/not a valid resolution/);
    expect(() => resolveRegisterItem(item({ kind: 'OPEN_QUESTION', statement: 'x' }), 'VALIDATED')).toThrow(/not a valid resolution/);
  });
  it('cannot resolve twice', () => {
    const d = resolveRegisterItem(item({ kind: 'DECISION', statement: 'x' }), 'DECIDED');
    expect(() => resolveRegisterItem(d, 'DECIDED')).toThrow(/already DECIDED/);
  });
  it('terminals table matches', () => {
    expect(REGISTER_TERMINALS.ASSUMPTION).toEqual(['VALIDATED', 'INVALIDATED']);
  });
});

describe('registerSummary', () => {
  it('tallies kinds, open, overdue and flags attention on invalidated/overdue', () => {
    const now = new Date('2026-07-25T00:00:00Z');
    const items = [
      item({ kind: 'DECISION', statement: 'd1' }),
      item({ kind: 'ASSUMPTION', statement: 'a1' }),                       // open, unvalidated
      resolveRegisterItem(item({ kind: 'ASSUMPTION', statement: 'a2' }), 'INVALIDATED'), // material risk
      item({ kind: 'OPEN_QUESTION', statement: 'q1', dueAt: '2026-07-01' }), // overdue
    ];
    const s = registerSummary(items, now);
    expect(s).toMatchObject({
      decisions: 1, assumptions: 2, openQuestions: 1,
      open: 3, unvalidatedAssumptions: 1, invalidatedAssumptions: 1, overdue: 1,
      needsAttention: true,
    });
  });

  it('all resolved, none overdue ⇒ no attention', () => {
    const s = registerSummary([resolveRegisterItem(item({ kind: 'DECISION', statement: 'x' }), 'DECIDED')]);
    expect(s.needsAttention).toBe(false);
    expect(s.open).toBe(0);
  });
});
