import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '@aura/core';
import { CbsService } from './cbs.service';
import { InMemoryCbsStore } from './in-memory-cbs-store';
import { makeCbsNode } from './domain/cbs';
import { WbsService } from './wbs.service';
import { InMemoryWbsStore } from './in-memory-wbs-store';
import { QuantityLedgerService } from './quantity-ledger.service';
import { InMemoryQuantityLedgerStore } from './in-memory-quantity-ledger-store';

const events = { append: vi.fn(async () => []) } as any;
const access = { assert: vi.fn() } as unknown as AccessService;

describe('C5 actual-cost writer boundary', () => {
  it('rejects direct CBS actualAmount patches', async () => {
    const store = new InMemoryCbsStore();
    const service = new CbsService(store, events);
    const node = makeCbsNode({ tenantId: 't1', projectId: 'p1', code: '01', title: 'Works' });
    await store.create(node);

    await expect(service.update(node.id, { actualAmount: 100 })).rejects.toThrow('Cost Ledger-owned');
    expect((await store.get(node.id))?.actualAmount).toBe(0);
  });

  it('rejects the legacy direct WBS actual-spend writer', async () => {
    const store = new InMemoryWbsStore();
    const service = new WbsService(store, events, access, new QuantityLedgerService(new InMemoryQuantityLedgerStore()));
    const node = await service.create({ tenantId: 't1', projectId: 'p1', code: '01', title: 'Works' });

    await expect(service.recordActualSpend(node.id, 100)).rejects.toThrow('Cost Ledger-owned');
    expect((await service.get(node.id))?.actualCost).toBe(0);
  });
});
