import { describe, expect, it } from 'vitest';
import { TENDER_EVENT, makeTender } from './tender';

describe('tendering tender model', () => {
  it('creates a tender with sane defaults and trimmed fields', () => {
    const t = makeTender({ tenantId: 't1', title: '  Tower CCTV Fit-out  ' });
    expect(t.title).toBe('Tower CCTV Fit-out');
    expect(t.status).toBe('draft');
    expect(t.value).toBe(0);
    expect(t.reference).toBeNull();
    expect(t.accountId).toBeNull();
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the account reference + snapshot and provided value', () => {
    const t = makeTender({
      tenantId: 't1',
      title: 'Mall ELV Package',
      reference: 'TND-2026-001',
      accountId: 'acc-9',
      accountName: 'Globex MEP',
      status: 'submitted',
      value: 1250000,
    });
    expect(t.accountId).toBe('acc-9');
    expect(t.accountName).toBe('Globex MEP');
    expect(t.reference).toBe('TND-2026-001');
    expect(t.status).toBe('submitted');
    expect(t.value).toBe(1250000);
  });

  it('coerces a missing/garbage value to 0', () => {
    expect(makeTender({ tenantId: 't1', title: 'X' }).value).toBe(0);
    expect(makeTender({ tenantId: 't1', title: 'X', value: Number.NaN }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(TENDER_EVENT.created).toBe('tendering.tender.created');
  });
});
