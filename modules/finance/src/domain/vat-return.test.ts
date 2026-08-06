import { describe, it, expect } from 'vitest';
import { calculateTaxReturn, calculateTaxSummary, makeTaxReturn, makeTaxCode, makeTaxLine, type TaxLine, type TaxCode } from './tax';
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
  taxPointDate: '2026-01-15',
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
      line({ taxCodeId: outCode, taxAmount: 100, taxPointDate: '2026-01-15', createdAt: '2026-01-15T00:00:00Z' }), // Q1 output
      line({ taxCodeId: inCode, taxAmount: 40, taxPointDate: '2026-02-10', createdAt: '2026-02-10T00:00:00Z' }), // Q1 input
      line({ taxCodeId: outCode, taxAmount: 999, taxPointDate: '2026-05-01', createdAt: '2026-05-01T00:00:00Z' }), // Q2 — excluded
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
    await lineStore.create(line({ taxCodeId: outCode, taxAmount: 250, taxPointDate: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' }));
    await lineStore.create(line({ taxCodeId: inCode, taxAmount: 90, taxPointDate: '2026-02-20', createdAt: '2026-02-20T00:00:00Z' }));
    await lineStore.create(line({ taxCodeId: outCode, taxAmount: 700, taxPointDate: '2025-12-01', createdAt: '2025-12-01T00:00:00Z' })); // prior period

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

// ── Regressions found in the deeper (wave-3) finance audit ────────────────────
describe('VAT return lifecycle — draft → filed → paid, forward only', () => {
  const codes: TaxCode[] = [makeTaxCode({ tenantId: 't1', code: 'VAT-5', description: 'Output 5%', rate: 5, taxType: 'output' })];
  const outCode = codes[0].id;

  const freshService = async () => {
    const lineStore = new InMemoryTaxLineStore();
    const codeStore = new InMemoryTaxCodeStore();
    const returnStore = new InMemoryTaxReturnStore();
    for (const c of codes) await codeStore.create(c);
    await lineStore.create(line({ taxCodeId: outCode, taxAmount: 250, taxPointDate: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' }));
    return new TaxService(codeStore, lineStore, returnStore);
  };

  it('rejects draft → paid: a return cannot be paid without being filed first', async () => {
    const svc = await freshService();
    const ret = await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    await expect(svc.setReturnStatus(ret.id, 'paid')).rejects.toThrow(/only a filed VAT return can be marked paid/);
  });

  it('rejects re-filing a filed return, preserving the original submission timestamp', async () => {
    const svc = await freshService();
    const ret = await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    const filed = await svc.setReturnStatus(ret.id, 'filed', 'u-admin');
    await expect(svc.setReturnStatus(ret.id, 'filed', 'u-other')).rejects.toThrow(/only a draft VAT return can be filed/);
    // The stored return still carries the first filing's stamp.
    expect((await svc.getReturn(ret.id))?.filedBy).toBe('u-admin');
    expect((await svc.getReturn(ret.id))?.filedAt).toBe(filed.filedAt);
  });

  it('rejects paid → filed: a settled return cannot be reverted', async () => {
    const svc = await freshService();
    const ret = await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    await svc.setReturnStatus(ret.id, 'filed');
    await svc.setReturnStatus(ret.id, 'paid');
    await expect(svc.setReturnStatus(ret.id, 'filed')).rejects.toThrow(/only a draft VAT return can be filed/);
  });

  it('rejects a second return that overlaps an already-filed period', async () => {
    const svc = await freshService();
    const q1 = await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    await svc.setReturnStatus(q1.id, 'filed', 'u-admin');
    // A monthly return inside the filed quarter would double-declare the same output tax.
    await expect(svc.generateReturn('t1', '2026-02-01', '2026-02-28')).rejects.toThrow(/already covers/);
  });

  it('still lets a draft be regenerated (no filed return in the way)', async () => {
    const svc = await freshService();
    await svc.generateReturn('t1', '2026-01-01', '2026-03-31');
    // Draft-only overlap is allowed — regenerating supersedes the earlier draft.
    await expect(svc.generateReturn('t1', '2026-01-01', '2026-03-31')).resolves.toBeTruthy();
  });
});

// ── Regressions found in the wave-2 finance audit ─────────────────────────────
describe('VAT engine — rules that were wrong', () => {
  const rc = makeTaxCode({ tenantId: 't1', code: 'RC', description: 'Reverse charge', rate: 5, taxType: 'reverse_charge' });
  const out = makeTaxCode({ tenantId: 't1', code: 'VAT-5', description: 'Output 5%', rate: 5, taxType: 'output' });
  const inp = makeTaxCode({ tenantId: 't1', code: 'VAT-IN', description: 'Input 5%', rate: 5, taxType: 'input' });

  it('declares reverse charge on BOTH sides, so net payable is not understated', () => {
    // 100,000 of local sales (5,000 output) + a 20,000 imported service under reverse charge.
    // The recipient self-accounts: 1,000 output AND 1,000 input. Net stays 5,000.
    // This used to credit input only, understating net payable by the full RC amount — an
    // under-declaration to the FTA, not a presentation problem.
    const lines = [
      makeTaxLine({ tenantId: 't1', invoiceId: 'i1', taxCodeId: out.id, taxableAmount: 100_000, taxRate: 5 }),
      makeTaxLine({ tenantId: 't1', invoiceId: 'i2', taxCodeId: rc.id, taxableAmount: 20_000, taxRate: 5 }),
    ];
    const s = calculateTaxSummary(lines, [out, rc]);
    expect(s.totalOutputTax).toBe(6_000);
    expect(s.totalInputTax).toBe(1_000);
    expect(s.netPayable).toBe(5_000);
  });

  it('leaves reverse charge net-neutral when there are no other supplies', () => {
    const lines = [makeTaxLine({ tenantId: 't1', invoiceId: 'i1', taxCodeId: rc.id, taxableAmount: 20_000, taxRate: 5 })];
    expect(calculateTaxSummary(lines, [rc]).netPayable).toBe(0);
  });

  it('still treats ordinary input tax as recoverable only', () => {
    const lines = [
      makeTaxLine({ tenantId: 't1', invoiceId: 'i1', taxCodeId: out.id, taxableAmount: 100_000, taxRate: 5 }),
      makeTaxLine({ tenantId: 't1', invoiceId: 'i2', taxCodeId: inp.id, taxableAmount: 40_000, taxRate: 5 }),
    ];
    const s = calculateTaxSummary(lines, [out, inp]);
    expect(s.totalOutputTax).toBe(5_000);
    expect(s.netPayable).toBe(3_000);
  });

  it('stores the NET taxable amount for a tax-inclusive line', () => {
    // 105,000 gross at 5% = 100,000 net + 5,000 tax. The gross used to be stored as the taxable
    // amount, so the return box showed 105,000 taxable against 5,000 VAT — which is not 5%.
    const l = makeTaxLine({ tenantId: 't1', invoiceId: 'i1', taxCodeId: out.id, taxableAmount: 105_000, taxRate: 5, isInclusive: true });
    expect(l.taxAmount).toBe(5_000);
    expect(l.taxableAmount).toBe(100_000);
    expect(l.taxableAmount * (l.taxRate / 100)).toBeCloseTo(l.taxAmount, 2);
  });

  it('files a backdated invoice in the period it was SUPPLIED, not the period it was entered', () => {
    // A March supply booked on 2 April. Filtering on createdAt put it in the April return:
    // March under-declared, April over-declared, both filed wrong.
    const march = makeTaxLine({
      tenantId: 't1', invoiceId: 'i1', taxCodeId: out.id, taxableAmount: 10_000, taxRate: 5,
      taxPointDate: '2026-03-28',
    });
    const q1 = calculateTaxReturn([march], [out], '2026-01-01', '2026-03-31');
    const q2 = calculateTaxReturn([march], [out], '2026-04-01', '2026-06-30');
    expect(q1.totalOutputTax).toBe(500);
    expect(q2.totalOutputTax).toBe(0);
  });

  it('rejects a negative tax rate', () => {
    expect(() => makeTaxLine({ tenantId: 't1', invoiceId: 'i1', taxCodeId: out.id, taxableAmount: 100, taxRate: -5 }))
      .toThrow(/cannot be negative/);
  });
});
