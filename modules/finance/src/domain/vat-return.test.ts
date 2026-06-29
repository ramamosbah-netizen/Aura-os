import { describe, it, expect } from 'vitest';
import { calculateTaxReturn, makeTaxReturn, makeTaxCode, type TaxLine, type TaxCode } from './tax';
import { TaxService } from '../tax.service';
import { InMemoryTaxCodeStore, InMemoryTaxLineStore, InMemoryTaxReturnStore } from '../in-memory-tax-store';

const line = (over: Partial<TaxLine>): TaxLine => ({
  id: Math.random().toString(36).slice(2),
  tenantId: 't1',
  invoiceId: 'inv',
  taxCodeId: 'c-out',
  taxableAmount: 2000,
  taxRate: 5,
  taxAmount: 100,
  isInclusive: false,
  createdAt: '2026-01-15T10:00:00.000Z',
  ...over,
});

describe('VAT return (period filing)', () => {
  const codes: TaxCode[] = [
    makeTaxCode({ tenantId: 't1', code: 'VAT-5', description: 'Output 5%', rate: 5, taxType: 'output' }),
    makeTaxCode({ tenantId: 't1', code: 'VAT-IN', description: 'Input 5%', rate: 5, taxType: 'input' }),
  ];
  const outCode = codes[0].id;
  const inCode = codes[1].id;

  it('only counts tax lines whose date falls in the period', () => {
    const lines = [
      line({ taxCodeId: outCode, taxAmount: 100, createdAt: '2026-01-15T00:00:00Z' }), // Q1 output
      line({ taxCodeId: inCode, taxAmount: 40, createdAt: '2026-02-10T00:00:00Z' }), // Q1 input
      line({ taxCodeId: outCode, taxAmount: 999, createdAt: '2026-05-01T00:00:00Z' }), // Q2 — excluded
    ];
    const r = calculateTaxReturn(lines, codes, '2026-01-01', '2026-03-31');
    expect(r.totalOutputTax).toBe(100);
    expect(r.totalInputTax).toBe(40);
    expect(r.netPayable).toBe(60);
  });

  it('makeTaxReturn computes net and starts as draft', () => {
    const ret = makeTaxReturn({ tenantId: 't1', periodStart: '2026-01-01', periodEnd: '2026-03-31', totalOutputTax: 500, totalInputTax: 180 });
    expect(ret.netTaxPayable).toBe(320);
    expect(ret.status).toBe('draft');
    expect(() => makeTaxReturn({ tenantId: 't1', periodStart: '2026-03-31', periodEnd: '2026-01-01', totalOutputTax: 0, totalInputTax: 0 })).toThrow('on or after');
  });

  it('TaxService generates a draft return for a period and files it', async () => {
    const lineStore = new InMemoryTaxLineStore();
    const codeStore = new InMemoryTaxCodeStore();
    const returnStore = new InMemoryTaxReturnStore();
    for (const c of codes) await codeStore.create(c);
    await lineStore.create(line({ taxCodeId: outCode, taxAmount: 250, createdAt: '2026-02-01T00:00:00Z' }));
    await lineStore.create(line({ taxCodeId: inCode, taxAmount: 90, createdAt: '2026-02-20T00:00:00Z' }));
    await lineStore.create(line({ taxCodeId: outCode, taxAmount: 700, createdAt: '2025-12-01T00:00:00Z' })); // prior period

    const svc = new TaxService(codeStore, lineStore, returnStore);
    const ret = await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    expect(ret.totalOutputTax).toBe(250);
    expect(ret.totalInputTax).toBe(90);
    expect(ret.netTaxPayable).toBe(160);
    expect(ret.status).toBe('draft');

    const filed = await svc.setReturnStatus(ret.id, 'filed', 'u-admin');
    expect(filed.status).toBe('filed');
    expect(filed.filedAt).toBeTruthy();
    expect(filed.filedBy).toBe('u-admin');

    expect(await svc.listReturns('t1')).toHaveLength(1);
  });
});
