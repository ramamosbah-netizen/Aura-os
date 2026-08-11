import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, CommandBus, NumberingService, AuditService, TenantContext } from '@aura/core';
import { PurchaseOrderService } from './purchase-order.service';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { InMemorySupplierStore } from './in-memory-supplier-store';
import { makePurchaseOrder } from './domain/purchase-order';

/** A TxRunner that just runs the callback — these tests assert events, not transactionality. */
const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const commands = { register: () => {} } as unknown as CommandBus;
const numbering = { generateNextNumber: async () => 'PO-TEST-1' } as unknown as NumberingService;
const audit = { log: async () => {} } as unknown as AuditService;

// The PO under test is seeded straight into the store: `create()` dispatches through the
// CommandBus, which is not what G-12 is about, and stubbing that machinery would test the stub.
async function harness(actorId: string | null = null) {
  const appended: Array<{ type: string; actorId: string | null; payload: Record<string, unknown> }> = [];
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn(async (_h: unknown, evts: Array<{ type: string; actorId: string | null; payload: Record<string, unknown> }>) => {
      appended.push(...evts);
    }),
  } as unknown as EventStore;
  const tenant = actorId
    ? ({
        get: () => ({ tenantId: 't1', companyId: null, actorId, correlationId: 'test' }),
        // The service also asks for the BOUND tenant when scoping reads (N-08); boundTenantId
        // deliberately has no dev-default fallback, so the stub must answer it too.
        boundTenantId: () => 't1',
      } as unknown as TenantContext)
    : null;
  const store = new InMemoryPurchaseOrderStore();
  const po = makePurchaseOrder({
    tenantId: 't1',
    title: 'CCTV cameras',
    value: 120_000,
    supplierId: 'sup-1',
    supplierName: 'Hikvision MEA',
    createdBy: 'u-buyer',
  });
  await store.create(po);
  const svc = new PurchaseOrderService(
    store,
    events,
    tx,
    commands,
    numbering,
    audit,
    new InMemorySupplierStore(),
    undefined,
    tenant,
  );
  return { svc, appended, po };
}

// G-12 — the last uncovered value mutation in the audit trail. The PO event recorded only the new
// state and no actor, so "who re-pointed this order at a different supplier, and away from whom"
// was unanswerable from the log.
describe('PurchaseOrderService.update — audit diff (G-12)', () => {
  it('records the before→after for a supplier swap', async () => {
    const { svc, appended, po } = await harness();

    await svc.update(po.id, { supplierId: 'sup-2', supplierName: 'Dahua Gulf' });

    const evt = appended.at(-1)!;
    expect(evt.payload.changes).toEqual({
      supplierId: { from: 'sup-1', to: 'sup-2' },
      supplierName: { from: 'Hikvision MEA', to: 'Dahua Gulf' },
    });
  });

  it('records only the fields that actually changed', async () => {
    const { svc, appended, po } = await harness();

    await svc.update(po.id, { title: 'CCTV cameras (rev B)', supplierName: 'Hikvision MEA' });

    expect(appended.at(-1)!.payload.changes).toEqual({
      title: { from: 'CCTV cameras', to: 'CCTV cameras (rev B)' },
    });
  });

  it('emits an empty change set rather than inventing one when nothing changed', async () => {
    const { svc, appended, po } = await harness();

    await svc.update(po.id, { title: 'CCTV cameras' });

    expect(appended.at(-1)!.payload.changes).toEqual({});
  });

  it('stamps the real acting user from the request context, not the PO creator', async () => {
    const { svc, appended, po } = await harness('u-manager'); // the PO's createdBy is u-buyer

    await svc.update(po.id, { supplierName: 'Dahua Gulf' });

    expect(appended.at(-1)!.actorId).toBe('u-manager');
  });

  it('falls back to the creator when there is no request context (system/auto paths)', async () => {
    const { svc, appended, po } = await harness(null);

    await svc.update(po.id, { supplierName: 'Dahua Gulf' });

    expect(appended.at(-1)!.actorId).toBe('u-buyer');
  });
});
