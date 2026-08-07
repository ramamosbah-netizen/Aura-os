import { describe, expect, it } from 'vitest';
import { PROCUREMENT_EVENT, makePurchaseOrder, assertPoTransition, isPurchaseOrderStatus } from './purchase-order';

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

  it('rejects a negative value', () => {
    expect(() => makePurchaseOrder({ tenantId: 't1', title: 'X', value: -100 })).toThrow(/cannot be negative/);
  });

  it('rejects a negative or non-numeric ordered quantity, but keeps a positive one', () => {
    expect(() => makePurchaseOrder({ tenantId: 't1', title: 'X', orderedQuantity: -5 })).toThrow(/positive number/);
    expect(() => makePurchaseOrder({ tenantId: 't1', title: 'X', orderedQuantity: Number.NaN })).toThrow(/positive number/);
    expect(makePurchaseOrder({ tenantId: 't1', title: 'X', orderedQuantity: 12 }).orderedQuantity).toBe(12);
    expect(makePurchaseOrder({ tenantId: 't1', title: 'X' }).orderedQuantity).toBeNull();
  });

  it('exposes the spine event type', () => {
    expect(PROCUREMENT_EVENT.poCreated).toBe('procurement.po.created');
  });
});

describe('purchase-order state machine (assertPoTransition)', () => {
  it('allows the normal lifecycle', () => {
    expect(() => assertPoTransition('draft', 'pending_approval')).not.toThrow();
    expect(() => assertPoTransition('pending_approval', 'approved')).not.toThrow();
    expect(() => assertPoTransition('approved', 'issued')).not.toThrow();
    expect(() => assertPoTransition('issued', 'received')).not.toThrow();
    expect(() => assertPoTransition('received', 'closed')).not.toThrow();
    expect(() => assertPoTransition('draft', 'issued')).not.toThrow(); // auto-approved small PO
  });

  it('allows cancelling any live PO', () => {
    for (const from of ['draft', 'pending_approval', 'approved', 'issued', 'received'] as const) {
      expect(() => assertPoTransition(from, 'cancelled')).not.toThrow();
    }
  });

  it('will not un-cancel or revive a terminal PO', () => {
    expect(() => assertPoTransition('cancelled', 'issued')).toThrow(/can only move/);
    expect(() => assertPoTransition('cancelled', 'draft')).toThrow(/terminal/);
    expect(() => assertPoTransition('closed', 'issued')).toThrow(/terminal/);
  });

  it('rejects backward moves', () => {
    expect(() => assertPoTransition('received', 'draft')).toThrow(/can only move/);
    expect(() => assertPoTransition('issued', 'approved')).toThrow(/can only move/);
  });

  it('rejects an unknown status', () => {
    expect(() => assertPoTransition('draft', 'foo' as never)).toThrow(/unknown purchase order status/);
    expect(isPurchaseOrderStatus('foo')).toBe(false);
    expect(isPurchaseOrderStatus('issued')).toBe(true);
  });
});
