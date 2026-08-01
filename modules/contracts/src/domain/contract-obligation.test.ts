import { describe, it, expect } from 'vitest';
import { makeContractObligation, setObligationStatus, isOverdue } from './contract-obligation';

const base = { tenantId: 't', contractId: 'c', title: 'Submit programme', dueDate: '2026-02-01' };

describe('contract-obligation domain', () => {
  it('defaults to open / deliverable / us', () => {
    const o = makeContractObligation(base);
    expect(o.status).toBe('open');
    expect(o.obligationType).toBe('deliverable');
    expect(o.responsibleParty).toBe('us');
    expect(o.completedDate).toBeNull();
  });

  it('met/waived stamp a completed date; other transitions do not', () => {
    const o = makeContractObligation(base);
    expect(setObligationStatus(o, 'met', '2026-01-20').completedDate).toBe('2026-01-20');
    expect(setObligationStatus(o, 'waived', '2026-01-20').completedDate).toBe('2026-01-20');
    expect(setObligationStatus(o, 'in_progress').completedDate).toBeNull();
  });

  it('isOverdue: open + past due = true; closed or future = false', () => {
    const o = makeContractObligation(base);
    expect(isOverdue(o, '2026-03-01')).toBe(true);
    expect(isOverdue(o, '2026-01-01')).toBe(false);
    expect(isOverdue(setObligationStatus(o, 'met'), '2026-03-01')).toBe(false);
  });
});
