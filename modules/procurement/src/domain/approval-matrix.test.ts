import { describe, it, expect } from 'vitest';
import { requiredApproval } from './approval-matrix';

describe('PO approval matrix', () => {
  it('auto-approves below the threshold', () => {
    const r = requiredApproval(4000);
    expect(r.level).toBe(0);
    expect(r.autoApproved).toBe(true);
  });

  it('escalates the required level by value band', () => {
    expect(requiredApproval(30_000)).toMatchObject({ level: 1, label: 'Manager', autoApproved: false });
    expect(requiredApproval(300_000)).toMatchObject({ level: 2, label: 'Director' });
    expect(requiredApproval(2_000_000)).toMatchObject({ level: 3, label: 'Board' });
  });

  it('boundaries are inclusive', () => {
    expect(requiredApproval(5_000).level).toBe(0);
    expect(requiredApproval(50_000).level).toBe(1);
  });
});
