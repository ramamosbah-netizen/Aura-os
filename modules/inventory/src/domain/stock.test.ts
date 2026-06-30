import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeStockItem, applyMovement, computeWac, summariseValuation, isBelowReorder, suggestedReorderQty, summariseReorder } from './stock';
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

  it('makeStockItem seeds avgCost from openingCost (clamped non-negative)', () => {
    expect(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 10, openingCost: 5 }).avgCost).toBe(5);
    expect(makeStockItem({ tenantId: 't1', code: 'A', name: 'a' }).avgCost).toBe(0);
    expect(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingCost: -3 }).avgCost).toBe(0);
  });

  it('computeWac re-averages on receipt and is unchanged on issue', () => {
    // 100 @ 5 then receive 100 @ 7 → (500+700)/200 = 6
    expect(computeWac(100, 5, 'in', 100, 7)).toBe(6);
    // issue never moves the average
    expect(computeWac(200, 6, 'out', 50, 0)).toBe(6);
    // first receipt into empty stock adopts the receipt cost
    expect(computeWac(0, 0, 'in', 10, 8)).toBe(8);
  });

  it('summariseValuation rolls on-hand × WAC into a grand total', () => {
    const items = [
      makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 10, openingCost: 5 }),
      makeStockItem({ tenantId: 't1', code: 'B', name: 'b', openingQty: 4, openingCost: 2.5 }),
    ];
    const v = summariseValuation(items);
    expect(v.lines[0].totalValue).toBe(50);
    expect(v.lines[1].totalValue).toBe(10);
    expect(v.grandTotal).toBe(60);
  });

  it('isBelowReorder triggers only when a policy is set and on-hand ≤ level', () => {
    expect(isBelowReorder(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 5, reorderLevel: 10 }))).toBe(true);
    expect(isBelowReorder(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 10, reorderLevel: 10 }))).toBe(true); // at level
    expect(isBelowReorder(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 20, reorderLevel: 10 }))).toBe(false);
    expect(isBelowReorder(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 0 }))).toBe(false); // no policy
  });

  it('suggestedReorderQty uses reorderQty, else tops up to the level', () => {
    expect(suggestedReorderQty(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 3, reorderLevel: 10, reorderQty: 50 }))).toBe(50);
    expect(suggestedReorderQty(makeStockItem({ tenantId: 't1', code: 'A', name: 'a', openingQty: 3, reorderLevel: 10 }))).toBe(7); // 10 - 3
  });

  it('summariseReorder lists only triggered items, shortest-first', () => {
    const items = [
      makeStockItem({ tenantId: 't1', code: 'OK', name: 'ok', openingQty: 100, reorderLevel: 10 }),
      makeStockItem({ tenantId: 't1', code: 'LOW', name: 'low', openingQty: 8, reorderLevel: 10, reorderQty: 40 }),
      makeStockItem({ tenantId: 't1', code: 'OUT', name: 'out', openingQty: 0, reorderLevel: 5 }),
    ];
    const r = summariseReorder(items);
    expect(r.count).toBe(2);
    expect(r.lines[0].code).toBe('OUT'); // deficit -5 sorts before LOW's -2
    expect(r.lines[0].suggestedQty).toBe(5);
    expect(r.lines[1].code).toBe('LOW');
    expect(r.lines[1].suggestedQty).toBe(40);
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

  it('tracks moving-average cost and reports valuation through the service', async () => {
    const s = build();
    const item = await s.createItem({ tenantId: 't1', code: 'CBL-01', name: 'Cat6', openingQty: 100, openingCost: 5, createdBy: 'u1' });
    expect(item.avgCost).toBe(5);

    const inMv = await s.recordMovement(item.id, 'in', 100, 'GRN', 7); // → 200 @ 6
    expect(inMv.item.avgCost).toBe(6);
    expect(inMv.movement.unitCost).toBe(7);
    expect(inMv.movement.valueAfter).toBe(1200);

    const outMv = await s.recordMovement(item.id, 'out', 50, 'issue'); // avg stays 6, COGS rate 6
    expect(outMv.item.avgCost).toBe(6);
    expect(outMv.movement.unitCost).toBe(6);
    expect(outMv.movement.valueAfter).toBe(900); // 150 × 6

    const val = await s.valuation({ tenantId: 't1' });
    expect(val.grandTotal).toBe(900);
  });

  it('sets a reorder policy and surfaces triggered items in the report', async () => {
    const s = build();
    const item = await s.createItem({ tenantId: 't1', code: 'CBL-01', name: 'Cat6', openingQty: 8, createdBy: 'u1' });
    expect((await s.reorderReport({ tenantId: 't1' })).count).toBe(0); // no policy yet

    const updated = await s.setReorderPolicy(item.id, 10, 40);
    expect(updated.reorderLevel).toBe(10);
    expect(updated.reorderQty).toBe(40);

    const rep = await s.reorderReport({ tenantId: 't1' });
    expect(rep.count).toBe(1);
    expect(rep.lines[0].code).toBe('CBL-01');
    expect(rep.lines[0].suggestedQty).toBe(40);

    // receive enough to clear the trigger
    await s.recordMovement(item.id, 'in', 50, 'GRN');
    expect((await s.reorderReport({ tenantId: 't1' })).count).toBe(0);
  });

  it('rejects duplicate codes and over-issue', async () => {
    const s = build();
    await s.createItem({ tenantId: 't1', code: 'X', name: 'x' });
    await expect(s.createItem({ tenantId: 't1', code: 'X', name: 'dup' })).rejects.toThrow('already exists');
    const item = await s.createItem({ tenantId: 't1', code: 'Y', name: 'y', openingQty: 5 });
    await expect(s.recordMovement(item.id, 'out', 9)).rejects.toThrow('insufficient stock');
  });
});
