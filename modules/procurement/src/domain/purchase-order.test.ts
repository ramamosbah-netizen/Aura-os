import { describe, expect, it } from 'vitest';
import { PROCUREMENT_EVENT, makePurchaseOrder } from './purchase-order';

describe('procurement purchase-order model', () => {
  it('creates a PO with sane defaults and trimmed fields', () => {
    const po = makePurchaseOrder({ tenantId: 't1', title: '  Cable & containment  ' });
    expect(po.title).toBe('Cable & containment');
    expect(po.status).toBe('draft');
    expect(po.value).toBe(0);
    expect(po.reference).toBeNull();
    expect(po.supplierName).toBeNull();
    expect(po.projectId).toBeNull();
    expect(po.id).toBeTruthy();
    expect(po.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the project reference + snapshot, supplier, and value', () => {
    const po = makePurchaseOrder({
      tenantId: 't1',
      title: 'CCTV cameras',
      reference: 'PO-2026-014',
      supplierName: 'Hikvision MEA',
      projectId: 'proj-7',
      projectName: 'Tower Fit-out',
      status: 'issued',
      value: 480000,
    });
    expect(po.reference).toBe('PO-2026-014');
    expect(po.supplierName).toBe('Hikvision MEA');
    expect(po.projectId).toBe('proj-7');
    expect(po.projectName).toBe('Tower Fit-out');
    expect(po.status).toBe('issued');
    expect(po.value).toBe(480000);
  });

  it('coerces a missing/garbage value to 0', () => {
    expect(makePurchaseOrder({ tenantId: 't1', title: 'X' }).value).toBe(0);
    expect(makePurchaseOrder({ tenantId: 't1', title: 'X', value: Number.NaN }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(PROCUREMENT_EVENT.poCreated).toBe('procurement.po.created');
  });
});
