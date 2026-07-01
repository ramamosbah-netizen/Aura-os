import { describe, it, expect } from 'vitest';
import { makeProfitCenter, buildProfitCenterReport, type ProfitCenter } from './profit-center';

const pc = (id: string, code: string): ProfitCenter => ({
  id, tenantId: 't1', companyId: null, code, name: `PC ${code}`, active: true, createdAt: '2026-01-01T00:00:00Z', createdBy: null,
});

describe('profit-center domain', () => {
  it('validates code + name', () => {
    expect(() => makeProfitCenter({ tenantId: 't1', code: '', name: 'x' })).toThrow('code is required');
    expect(makeProfitCenter({ tenantId: 't1', code: 'ELV', name: 'ELV Division' }).code).toBe('ELV');
  });

  it('contribution = credit − debit; untagged → unallocated', () => {
    const centers = [pc('p1', 'ELV'), pc('p2', 'MEP')];
    const lines = [
      { debit: 0, credit: 10000, profitCenterId: 'p1' }, // revenue
      { debit: 6000, credit: 0, profitCenterId: 'p1' },  // cost
      { debit: 0, credit: 4000, profitCenterId: 'p2' },
      { debit: 500, credit: 0, profitCenterId: null },   // unallocated cost
    ];
    const r = buildProfitCenterReport(centers, lines);
    expect(r.lines.find((l) => l.code === 'ELV')!.contribution).toBe(4000); // 10000 - 6000
    expect(r.lines.find((l) => l.code === 'MEP')!.contribution).toBe(4000);
    expect(r.unallocated.contribution).toBe(-500);
    expect(r.grandContribution).toBe(7500); // 4000 + 4000 - 500
  });
});
