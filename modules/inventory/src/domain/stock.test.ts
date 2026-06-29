import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeStockItem, applyMovement } from './stock';
import { StockService } from '../stock.service';
import { InMemoryStockStore } from '../in-memory-stock-store';

describe('stock domain', () => {
  it('makeStockItem applies defaults (unit pcs, warehouse Main, on-hand 0)', () => {
    const i = makeStockItem({ tenantId: 't1', code: 'CBL-01', name: 'Cat6 cable' });
    expect(i.unit).toBe('pcs');
    expect(i.warehouse).toBe('Main');
    expect(i.quantityOnHand).toBe(0);
  });

  it('validates code/name and a non-negative opening qty', () => {
    expect(() => makeStockItem({ tenantId: 't1', code: '', name: 'x' })).toThrow('code is required');
    expect(() => makeStockItem({ tenantId: 't1', code: 'c', name: 'n', openingQty: -5 })).toThrow('negative');
  });

  it('applyMovement adds/subtracts and refuses to go negative', () => {
    expect(applyMovement(10, 'in', 5)).toBe(15);
    expect(applyMovement(10, 'out', 4)).toBe(6);
    expect(() => applyMovement(3, 'out', 5)).toThrow('insufficient stock');
    expect(() => applyMovement(10, 'in', 0)).toThrow('must be positive');
  });
});

describe('StockService', () => {
  const build = () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    return new StockService(new InMemoryStockStore(), events, access);
  };

  it('creates an item, records movements, and tracks on-hand + history', async () => {
    const s = build();
    const item = await s.createItem({ tenantId: 't1', code: 'CBL-01', name: 'Cat6', unit: 'm', openingQty: 100, createdBy: 'u1' });
    expect(item.quantityOnHand).toBe(100);

    await s.recordMovement(item.id, 'out', 30, 'site issue');
    const after = await s.recordMovement(item.id, 'in', 50, 'GRN receipt');
    expect(after.item.quantityOnHand).toBe(120); // 100 - 30 + 50

    const detail = await s.getItemWithMovements(item.id);
    expect(detail?.item.quantityOnHand).toBe(120);
    expect(detail?.movements).toHaveLength(2);
    expect(detail?.movements[0].balanceAfter).toBe(120); // latest first
  });

  it('rejects duplicate codes and over-issue', async () => {
    const s = build();
    await s.createItem({ tenantId: 't1', code: 'X', name: 'x' });
    await expect(s.createItem({ tenantId: 't1', code: 'X', name: 'dup' })).rejects.toThrow('already exists');
    const item = await s.createItem({ tenantId: 't1', code: 'Y', name: 'y', openingQty: 5 });
    await expect(s.recordMovement(item.id, 'out', 9)).rejects.toThrow('insufficient stock');
  });
});
