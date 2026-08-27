import { describe, expect, it } from 'vitest';
import { QuantityLedgerService } from './quantity-ledger.service';
import { InMemoryQuantityLedgerStore } from './in-memory-quantity-ledger-store';

// Durable idempotency (mig 0255) — the physical twin of the cost-ledger test. The outbox replays a
// whole event on any subscriber failure, so a quantity post must be safe to run twice: the ledger
// gains ONE row and the BOQ position moves ONCE per distinct dedupeKey.

const tenantId = 'tenant-qty';

describe('QuantityLedgerService.post — durable idempotency on dedupeKey', () => {
  it('a replayed keyed post appends ONE row and leaves the position unchanged the second time', async () => {
    const svc = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
    const input = {
      tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'installed' as const,
      quantity: 12, unit: 'nr', source: 'installation' as const, dedupeKey: 'installed:evt-1',
    };
    const first = await svc.post(input);
    const second = await svc.post(input); // outbox re-delivery

    const pos = await svc.position(tenantId, 'boq1');
    expect(pos.installed).toBe(12);        // not 24
    expect(second.id).toBe(first.id);      // replay returns the original
    expect(await svc.list({ tenantId })).toHaveLength(1);
  });

  it('different keys accumulate; unkeyed posts still always append', async () => {
    const svc = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
    await svc.post({ tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'ordered', quantity: 5, source: 'po', dedupeKey: 'po-ordered:a' });
    await svc.post({ tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'ordered', quantity: 7, source: 'po', dedupeKey: 'po-ordered:b' });
    // no key → legacy always-append
    await svc.post({ tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'received', quantity: 3, source: 'grn' });
    await svc.post({ tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'received', quantity: 3, source: 'grn' });

    const pos = await svc.position(tenantId, 'boq1');
    expect(pos.ordered).toBe(12); // 5 + 7
    expect(pos.received).toBe(6); // 3 + 3, unkeyed twice
    expect(await svc.list({ tenantId })).toHaveLength(4);
  });

  it('the dedupe key is scoped per tenant', async () => {
    const svc = new QuantityLedgerService(new InMemoryQuantityLedgerStore());
    await svc.post({ tenantId, projectId: 'p1', boqItemId: 'boq1', type: 'installed', quantity: 1, source: 'installation', dedupeKey: 'installed:evt-1' });
    await svc.post({ tenantId: 'tenant-other', projectId: 'p9', boqItemId: 'boq9', type: 'installed', quantity: 1, source: 'installation', dedupeKey: 'installed:evt-1' });
    expect(await svc.list({ tenantId })).toHaveLength(1);
    expect(await svc.list({ tenantId: 'tenant-other' })).toHaveLength(1);
  });
});
