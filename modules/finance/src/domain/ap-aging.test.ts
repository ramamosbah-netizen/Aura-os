import { describe, it, expect } from 'vitest';
import { buildApAging, apAgingCsvRows, AP_AGING_CSV_COLUMNS } from './ap-aging';
import { toCsv } from '@aura/shared';
import type { Invoice } from './invoice';

function inv(over: Partial<Invoice>): Invoice {
  return {
    id: Math.random().toString(36).slice(2),
    tenantId: 't1',
    companyId: null,
    reference: null,
    title: 'Sub-bill',
    poId: null,
    poTitle: null,
    supplierName: 'BuildCo',
    projectId: null,
    projectName: null,
    wbsNodeId: null,
    status: 'approved',
    value: 1000,
    currency: 'AED',
    exchangeRate: 1,
    baseValue: 1000,
    ownerId: null,
    createdAt: '2026-06-01T00:00:00Z',
    createdBy: null,
    ...over,
  };
}

describe('buildApAging', () => {
  it('buckets approved invoices by invoice-date age, grouped by supplier', () => {
    const r = buildApAging(
      [
        inv({ supplierName: 'BuildCo', createdAt: '2026-06-30T10:00:00Z', value: 1000 }), // 10 days → 1-30
        inv({ supplierName: 'BuildCo', createdAt: '2026-04-01T10:00:00Z', value: 3000 }), // 100 days → 90+
        inv({ supplierName: 'Steel Ltd', createdAt: '2026-07-09T10:00:00Z', value: 700 }), // 1 day → 1-30
      ],
      '2026-07-10',
    );
    const bc = r.bySupplier.find((s) => s.supplierName === 'BuildCo')!;
    expect(bc.buckets.d1_30).toBe(1000);
    expect(bc.buckets.d90_plus).toBe(3000);
    expect(bc.total).toBe(4000);
    expect(r.totals.d1_30).toBe(1700);
    expect(r.totals.d90_plus).toBe(3000);
    expect(r.grandTotal).toBe(4700);
  });

  it('excludes draft, paid, and cancelled invoices', () => {
    const r = buildApAging(
      [inv({ status: 'draft' }), inv({ status: 'paid' }), inv({ status: 'cancelled' })],
      '2026-07-10',
    );
    expect(r.grandTotal).toBe(0);
    expect(r.bySupplier).toHaveLength(0);
  });

  it('labels unnamed suppliers', () => {
    const r = buildApAging([inv({ supplierName: null, value: 500 })], '2026-07-10');
    expect(r.bySupplier[0].supplierName).toBe('(unnamed supplier)');
  });

  it('sorts suppliers by descending total', () => {
    const r = buildApAging(
      [inv({ supplierName: 'Small', value: 100 }), inv({ supplierName: 'Big', value: 8000 })],
      '2026-07-10',
    );
    expect(r.bySupplier[0].supplierName).toBe('Big');
  });
});

describe('apAgingCsvRows (BI export)', () => {
  it('flattens per-supplier rows and appends a TOTAL row', () => {
    const r = buildApAging(
      [
        inv({ supplierName: 'BuildCo', createdAt: '2026-06-30T10:00:00Z', value: 1000 }),
        inv({ supplierName: 'Steel Ltd', createdAt: '2026-04-01T10:00:00Z', value: 3000 }),
      ],
      '2026-07-10',
    );
    const rows = apAgingCsvRows(r);
    expect(rows).toHaveLength(3); // 2 suppliers + TOTAL
    const total = rows[rows.length - 1];
    expect(total.supplier).toBe('TOTAL');
    expect(total.total).toBe(4000);
  });

  it('serialises to CSV with the fixed column order + header', () => {
    const r = buildApAging([inv({ supplierName: 'BuildCo', value: 1000, createdAt: '2026-07-09T00:00:00Z' })], '2026-07-10');
    const csv = toCsv(apAgingCsvRows(r), [...AP_AGING_CSV_COLUMNS]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('supplier,current,d1_30,d31_60,d61_90,d90_plus,total');
    expect(lines).toContain('TOTAL,0,1000,0,0,0,1000');
  });
});
