import { describe, it, expect } from 'vitest';
import { makeStockTransfer } from './stock-transfer';

const T = 'tenant-1';

describe('makeStockTransfer', () => {
  it('creates a completed transfer', () => {
    const t = makeStockTransfer({ tenantId: T, sourceItemId: 'a', destItemId: 'b', quantity: 10 });
    expect(t.quantity).toBe(10);
    expect(t.status).toBe('completed');
    expect(t.reason).toBe('warehouse transfer');
  });

  it('rejects zero quantity', () => {
    expect(() => makeStockTransfer({ tenantId: T, sourceItemId: 'a', destItemId: 'b', quantity: 0 }))
      .toThrow('positive');
  });

  it('rejects same source and dest', () => {
    expect(() => makeStockTransfer({ tenantId: T, sourceItemId: 'a', destItemId: 'a', quantity: 5 }))
      .toThrow('differ');
  });
});
