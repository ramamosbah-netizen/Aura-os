import { describe, expect, it } from 'vitest';
import { INVENTORY_EVENT, makeGoodsReceipt } from './goods-receipt';

describe('inventory goods-receipt model', () => {
  it('creates a GRN with sane defaults and trimmed fields', () => {
    const g = makeGoodsReceipt({ tenantId: 't1', title: '  Cable drums batch 1  ' });
    expect(g.title).toBe('Cable drums batch 1');
    expect(g.status).toBe('received');
    expect(g.value).toBe(0);
    expect(g.reference).toBeNull();
    expect(g.poId).toBeNull();
    expect(g.id).toBeTruthy();
    expect(g.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('carries the PO + supplier + project references down by snapshot', () => {
    const g = makeGoodsReceipt({
      tenantId: 't1',
      title: 'Switchgear delivery',
      reference: 'GRN-2026-001',
      poId: 'po-9',
      poTitle: 'Switchgear PO',
      supplierName: 'Globex MEP',
      projectId: 'prj-9',
      projectName: 'Metro Depot ELV',
      status: 'received',
      value: 90000,
    });
    expect(g.poId).toBe('po-9');
    expect(g.poTitle).toBe('Switchgear PO');
    expect(g.supplierName).toBe('Globex MEP');
    expect(g.projectId).toBe('prj-9');
    expect(g.projectName).toBe('Metro Depot ELV');
    expect(g.reference).toBe('GRN-2026-001');
    expect(g.value).toBe(90000);
  });

  it('coerces a missing/garbage value to 0', () => {
    expect(makeGoodsReceipt({ tenantId: 't1', title: 'X' }).value).toBe(0);
    expect(makeGoodsReceipt({ tenantId: 't1', title: 'X', value: Number.NaN }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(INVENTORY_EVENT.grnCreated).toBe('inventory.grn.created');
  });
});
