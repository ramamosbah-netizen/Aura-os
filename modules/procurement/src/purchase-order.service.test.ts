import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, CommandBus, NumberingService, AuditService, TenantContext } from '@aura/core';
import { PurchaseOrderService } from './purchase-order.service';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { InMemorySupplierStore } from './in-memory-supplier-store';
import { makePurchaseOrder } from './domain/purchase-order';
import { approveSupplier, makeSupplier } from './domain/supplier';

/** A TxRunner that just runs the callback — these tests assert events, not transactionality. */
const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const commands = { register: () => {} } as unknown as CommandBus;
const numbering = { generateNextNumber: async () => 'PO-TEST-1' } as unknown as NumberingService;
const audit = { log: async () => {} } as unknown as AuditService;

// The PO under test is seeded straight into the store: `create()` dispatches through the
// CommandBus, which is not what G-12 is about, and stubbing that machinery would test the stub.
async function harness(actorId: string | null = null, orderedQuantity: number | null = 100) {
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
  const supplierStore = new InMemorySupplierStore();
  await supplierStore.create(approveSupplier({ ...makeSupplier({ tenantId: 't1', code: 'SUP-1', name: 'Hikvision MEA' }), id: 'sup-1' }));
  await supplierStore.create(approveSupplier({ ...makeSupplier({ tenantId: 't1', code: 'SUP-2', name: 'Dahua Gulf' }), id: 'sup-2' }));
  await supplierStore.create({ ...makeSupplier({ tenantId: 't1', code: 'SUP-3', name: 'Pending Vendor' }), id: 'sup-pending' });
  const po = makePurchaseOrder({
    tenantId: 't1',
    title: 'CCTV cameras',
    value: 120_000,
    supplierId: 'sup-1',
    supplierName: 'Hikvision MEA',
    orderedQuantity,
    unit: orderedQuantity === null ? null : 'nr',
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
    supplierStore,
    undefined,
    tenant,
  );
  return { svc, appended, po, supplierStore };
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

    await svc.update(po.id, { title: 'CCTV cameras — manager revision' });

    expect(appended.at(-1)!.actorId).toBe('u-manager');
  });

  it('falls back to the creator when there is no request context (system/auto paths)', async () => {
    const { svc, appended, po } = await harness(null);

    await svc.update(po.id, { supplierName: 'Dahua Gulf' });

    expect(appended.at(-1)!.actorId).toBe('u-buyer');
  });
});

describe('PurchaseOrderService — governed supplier and status boundaries', () => {
  it('derives the supplier snapshot from an approved master record', async () => {
    const { svc, po } = await harness();
    const updated = await svc.update(po.id, { supplierId: 'sup-2', supplierName: 'Spoofed name' });
    expect(updated).toMatchObject({ supplierId: 'sup-2', supplierName: 'Dahua Gulf' });
  });

  it('refuses missing and unapproved supplier references', async () => {
    const { svc, po } = await harness();
    await expect(svc.update(po.id, { supplierId: 'missing-supplier' })).rejects.toThrow(/not found/);
    await expect(svc.update(po.id, { supplierId: 'sup-pending' })).rejects.toThrow(/not approved/);
  });

  it('keeps approval and receipt states behind their governed commands', async () => {
    const { svc, po } = await harness();
    await expect(svc.changeStatus(po.id, 'approved')).rejects.toThrow(/governed submit, approve or receipt command/);
    await expect(svc.changeStatus(po.id, 'received')).rejects.toThrow(/governed submit, approve or receipt command/);
  });

  it('distinguishes partial receipt from full receipt using canonical cumulative quantity', async () => {
    const { svc, po } = await harness();
    const partial = await svc.reconcileReceipt(po.id, 1);
    expect(partial.status).toBe('partially_received');
    const complete = await svc.reconcileReceipt(po.id, 100);
    expect(complete.status).toBe('received');
  });
});

/**
 * An unknown quantity is not a completion.
 *
 * Receiving against an order whose quantity nobody recorded used to mark the WHOLE order received —
 * the absence of a fact producing the strongest possible statement about it, and the one that stops
 * anyone chasing the rest of the delivery. The order's real state is "still cannot say", and that is
 * what it must keep saying.
 *
 * This is containment, not the partial-receipt model: it removes a false completion and adds no new
 * receipt semantics. Those are rebuilt on PO lines, where an order has items to receive against.
 */
describe('PurchaseOrderService.reconcileReceipt — an unknown does not become a completion', () => {
  it('leaves the order alone when the ORDERED quantity is unknown', async () => {
    const { svc, appended, po } = await harness(null, null);
    const before = po.status;

    const after = await svc.reconcileReceipt(po.id, 1);

    expect(after.status).toBe(before);
    expect(after.status).not.toBe('received');
    // No event either: an indeterminate reconciliation must not write a receipt into the log that
    // the cost and exposure readers would then treat as settled.
    expect(appended).toHaveLength(0);
  });

  it('leaves the order alone when the RECEIVED quantity is unknown', async () => {
    const { svc, appended, po } = await harness(null, 100);

    const after = await svc.reconcileReceipt(po.id, null);

    expect(after.status).toBe(po.status);
    expect(after.status).not.toBe('received');
    expect(appended).toHaveLength(0);
  });

  it('leaves the order alone when the ordered quantity contradicts the receipt', async () => {
    // Zero ordered with goods received against it is self-contradictory, and a conclusion drawn
    // from contradictory numbers is no better than one drawn from missing ones.
    const { svc, appended, po } = await harness(null, 0);

    const after = await svc.reconcileReceipt(po.id, 1);

    expect(after.status).not.toBe('received');
    expect(appended).toHaveLength(0);
  });

  it('still concludes normally once both quantities are known', async () => {
    const { svc, po } = await harness(null, 100);
    expect((await svc.reconcileReceipt(po.id, 1)).status).toBe('partially_received');
    expect((await svc.reconcileReceipt(po.id, 100)).status).toBe('received');
  });
});
