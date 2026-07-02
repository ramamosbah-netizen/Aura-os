import { describe, expect, it } from 'vitest';
import { makeStockItem, normaliseAltUnits, toBaseQty, uomFactor } from './stock';
import { StockService } from '../stock.service';
import { InMemoryStockStore } from '../in-memory-stock-store';
import { AccessService, type EventStore } from '@aura/core';

const mockAccess = { assert: () => {} } as unknown as AccessService;
const mockEvents = { append: async () => [] } as unknown as EventStore;

describe('multi-UOM + barcode domain', () => {
  const item = makeStockItem({
    tenantId: 't1',
    code: 'CEM-001',
    name: 'Cement OPC',
    unit: 'bag',
    barcode: '6291041500213',
    altUnits: [{ unit: 'pallet', factor: 40 }, { unit: 'ton', factor: 20 }],
  });

  it('stores barcode and normalised alt units', () => {
    expect(item.barcode).toBe('6291041500213');
    expect(item.altUnits).toEqual([{ unit: 'pallet', factor: 40 }, { unit: 'ton', factor: 20 }]);
  });

  it('converts entered quantities to the base unit', () => {
    expect(toBaseQty(item, 3, 'pallet')).toBe(120);
    expect(toBaseQty(item, 2.5, 'ton')).toBe(50);
    expect(toBaseQty(item, 7)).toBe(7); // base passes through
    expect(toBaseQty(item, 7, 'BAG')).toBe(7); // case-insensitive
    expect(() => toBaseQty(item, 1, 'box')).toThrow(/unknown unit/);
    expect(uomFactor(item, 'pallet')).toBe(40);
  });

  it('rejects bad alt-unit sets', () => {
    expect(() => normaliseAltUnits('bag', [{ unit: 'bag', factor: 2 }])).toThrow(/duplicate/);
    expect(() => normaliseAltUnits('bag', [{ unit: 'pallet', factor: 0 }])).toThrow(/positive factor/);
    expect(() => normaliseAltUnits('bag', [{ unit: 'x', factor: 2 }, { unit: 'X', factor: 3 }])).toThrow(/duplicate/);
  });
});

describe('multi-UOM + barcode service flow', () => {
  it('receives in an alt unit at alt-unit pricing and issues at base', async () => {
    const service = new StockService(new InMemoryStockStore(), mockEvents, mockAccess);
    const item = await service.createItem({
      tenantId: 't1', code: 'CEM-001', name: 'Cement OPC', unit: 'bag',
      barcode: 'BC-1', altUnits: [{ unit: 'pallet', factor: 40 }],
    });

    // receive 2 pallets @ 480/pallet → 80 bags @ 12/bag
    const rec = await service.recordMovement(item.id, 'in', 2, 'grn', 480, 'pallet');
    expect(rec.movement.quantity).toBe(80);
    expect(rec.movement.unitCost).toBe(12);
    expect(rec.item.quantityOnHand).toBe(80);
    expect(rec.item.avgCost).toBe(12);

    const iss = await service.recordMovement(item.id, 'out', 1, 'issue', undefined, 'pallet');
    expect(iss.movement.quantity).toBe(40);
    expect(iss.item.quantityOnHand).toBe(40);
  });

  it('resolves items by barcode and enforces barcode uniqueness', async () => {
    const service = new StockService(new InMemoryStockStore(), mockEvents, mockAccess);
    const a = await service.createItem({ tenantId: 't1', code: 'A', name: 'A', barcode: 'BC-9' });
    await expect(
      service.createItem({ tenantId: 't1', code: 'B', name: 'B', barcode: 'BC-9' }),
    ).rejects.toThrow(/already assigned/);

    const found = await service.getItemByBarcode('t1', 'BC-9');
    expect(found?.id).toBe(a.id);

    const updated = await service.setItemUom(a.id, { altUnits: [{ unit: 'box', factor: 6 }] });
    expect(updated.altUnits).toEqual([{ unit: 'box', factor: 6 }]);
    expect(updated.barcode).toBe('BC-9'); // untouched when not passed
  });
});
