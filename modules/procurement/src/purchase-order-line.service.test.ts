import { describe, it, expect, vi } from 'vitest';
import type { AccessService, ApprovalMatrixService, EventStore, TenantContext, TxRunner, CommandBus, NumberingService, AuditService } from '@aura/core';
import { PurchaseOrderLineService } from './purchase-order-line.service';
import { PurchaseRequestLineService, type MaterialCatalogue, type MaterialCitation, type ProjectCoding } from './purchase-request-line.service';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseOrderService } from './purchase-order.service';
import { InMemoryPurchaseOrderLineStore } from './in-memory-purchase-order-line-store';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { InMemoryPurchaseRequestLineStore } from './in-memory-purchase-request-line-store';
import { InMemorySupplierStore } from './in-memory-supplier-store';

/**
 * What an order buys, and how it came to buy it.
 *
 * Two things are under test and they are different in kind. One is ordinary: an order finally has
 * lines, so "what did we order" has an answer and a receipt has a subject. The other is the rule
 * that makes the lineage worth recording — a line may say it was competitively sourced only if the
 * chain that sourced it exists, while a line that says it was bought direct is making an explicit
 * statement rather than leaving a gap. Same NULL, opposite meanings, because a discriminator says
 * which.
 */

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
function fakeBus(): CommandBus {
  const handlers = new Map<string, { name: string; validate?: (p: unknown) => unknown; handler: (c: unknown, tx: unknown) => unknown }>();
  return {
    register: (def: { name: string }) => { handlers.set(def.name, def as never); },
    execute: async (cmd: { name: string; payload: unknown }) => {
      const def = handlers.get(cmd.name);
      if (!def) throw new Error(`no handler for ${cmd.name}`);
      if (def.validate) await def.validate(cmd.payload);
      return def.handler(cmd, null);
    },
  } as unknown as CommandBus;
}
const numbering = { generateNextNumber: async () => 'PO-1' } as unknown as NumberingService;
const audit = { log: async () => {} } as unknown as AuditService;
const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
const access = { assert: () => {} } as unknown as AccessService;
const noMatrix = { resolve: async () => null } as unknown as ApprovalMatrixService;

class FakeCatalogue implements MaterialCatalogue {
  async citeMaterial(reference: string): Promise<MaterialCitation> {
    const uom = reference.startsWith('CBL') ? 'm' : 'nr';
    if (reference === 'MADE-UP') throw new Error(`no material matches "${reference}" — a requisition must name one from the catalogue`);
    return {
      materialId: `mat-${reference}`, materialCode: reference, materialName: `${reference} material`,
      specification: 'as authored', manufacturer: 'Hikvision', model: 'DS-1', uom,
    };
  }
}

class FakeCoding implements ProjectCoding {
  readonly nodes = new Map<string, string>();
  async nodeBelongsToProject(_t: string, projectId: string, nodeId: string, kind: 'wbs' | 'cbs') {
    return this.nodes.get(`${kind}:${nodeId}`) === projectId;
  }
}

const tenant = {
  get: () => ({ tenantId: 't1', companyId: null, actorId: 'u-buyer', correlationId: 'test' }),
  boundTenantId: () => 't1',
} as unknown as TenantContext;

async function harness() {
  const poStore = new InMemoryPurchaseOrderStore();
  const poLineStore = new InMemoryPurchaseOrderLineStore();
  const prStore = new InMemoryPurchaseRequestStore();
  const prLineStore = new InMemoryPurchaseRequestLineStore();
  const coding = new FakeCoding();

  const poService = new PurchaseOrderService(poStore, events, tx, fakeBus(), numbering, audit, new InMemorySupplierStore(), undefined, tenant);
  poService.onModuleInit();
  const orderLines = new PurchaseOrderLineService(poLineStore, poStore, new FakeCatalogue(), prLineStore, coding, tenant);
  const requestLines = new PurchaseRequestLineService(prLineStore, prStore, new FakeCatalogue(), coding, tenant);
  const prs = new PurchaseRequestService(prStore, events, access, poService, noMatrix, tenant, prLineStore, orderLines);

  const po = await poService.create({ tenantId: 't1', title: 'Cameras', value: 0, projectId: 'proj-1', createdBy: 'u-buyer' });
  return { orderLines, requestLines, prs, poService, poStore, poLineStore, prStore, po, coding };
}

describe('an order line names a material and carries its description', () => {
  it('copies the whole description from the catalogue and takes the unit from it', async () => {
    const { orderLines, po } = await harness();
    const line = await orderLines.addLine({ poId: po.id, material: 'CBL-CAT6', quantity: 250, unitPrice: 4 });
    expect(line).toMatchObject({
      materialId: 'mat-CBL-CAT6', materialCode: 'CBL-CAT6', uom: 'm', quantity: 250, unitPrice: 4, lineNo: 1,
    });
  });

  it('refuses a material nobody can resolve, and writes nothing', async () => {
    const { orderLines, po } = await harness();
    await expect(orderLines.addLine({ poId: po.id, material: 'MADE-UP', quantity: 1, unitPrice: 1 }))
      .rejects.toThrow(/no material matches/);
    expect(await orderLines.listLines(po.id)).toHaveLength(0);
  });

  it('defaults an unstated lineage to DIRECT — a line nobody sourced has not been sourced', async () => {
    const { orderLines, po } = await harness();
    const line = await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 1, unitPrice: 1 });
    expect(line.sourceType).toBe('direct');
  });

  it('refuses a SOURCED line with no chain, even through the service', async () => {
    const { orderLines, po } = await harness();
    await expect(orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 1, unitPrice: 1, sourceType: 'sourced' }))
      .rejects.toThrow(/cannot claim it was competitively sourced/);
  });

  it('refuses a cited requisition line that does not exist — a lineage nobody resolves is not a lineage', async () => {
    const { orderLines, po } = await harness();
    await expect(orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 1, unitPrice: 1, sourcePrLineId: 'prl-ghost' }))
      .rejects.toThrow(/requisition line prl-ghost not found/);
  });

  it('refuses a cost node from another project', async () => {
    const { orderLines, po, coding } = await harness();
    coding.nodes.set('cbs:cbs-other', 'proj-2');
    await expect(orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 1, unitPrice: 1, cbsNodeId: 'cbs-other' }))
      .rejects.toThrow(/does not belong to this order's project/);
  });
});

describe('one order, one total', () => {
  it('keeps the persisted header in step with the lines', async () => {
    const { orderLines, poStore, po } = await harness();
    await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 10, unitPrice: 450 });
    expect((await poStore.get(po.id))?.value).toBe(4500);

    await orderLines.addLine({ poId: po.id, material: 'CBL-CAT6', quantity: 250, unitPrice: 4 });
    expect((await poStore.get(po.id))?.value).toBe(5500);
  });

  it('follows a removal back down and closes the numbering gap', async () => {
    const { orderLines, poStore, po } = await harness();
    await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 10, unitPrice: 450 });
    const second = await orderLines.addLine({ poId: po.id, material: 'CBL-CAT6', quantity: 250, unitPrice: 4 });
    await orderLines.addLine({ poId: po.id, material: 'CAM-2', quantity: 1, unitPrice: 100 });

    await orderLines.removeLine(second.id);

    const left = await orderLines.listLines(po.id);
    expect(left.map((l) => l.lineNo)).toEqual([1, 2]);
    expect((await poStore.get(po.id))?.value).toBe(4600);
  });

  it('reports what the order comes to and how it was arrived at', async () => {
    const { orderLines, po } = await harness();
    await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 10, unitPrice: 450 });
    expect(await orderLines.summary(po.id)).toMatchObject({
      total: { lineCount: 1, value: 4500 }, provenance: 'direct', derived: true,
    });
  });

  it('calls an order with no lines LEGACY, and leaves its authored value alone', async () => {
    const { orderLines, poService, poStore } = await harness();
    const legacy = await poService.create({ tenantId: 't1', title: 'Old order', value: 7500, createdBy: 'u-buyer' });
    expect(await orderLines.summary(legacy.id)).toMatchObject({ provenance: 'legacy', derived: false });
    expect((await poStore.get(legacy.id))?.value).toBe(7500);
  });
});

describe('lines are what the supplier was committed to', () => {
  it('refuses to add, edit or remove once the order has left draft', async () => {
    const { orderLines, poStore, po } = await harness();
    const line = await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 10, unitPrice: 450 });
    await poStore.update({ ...(await poStore.get(po.id))!, status: 'issued' });

    await expect(orderLines.addLine({ poId: po.id, material: 'CBL-CAT6', quantity: 1, unitPrice: 1 }))
      .rejects.toThrow(/only be changed while it is a draft/);
    await expect(orderLines.editLine(line.id, { quantity: 99 })).rejects.toThrow(/only be changed while it is a draft/);
    await expect(orderLines.removeLine(line.id)).rejects.toThrow(/only be changed while it is a draft/);
  });

  it('edits the commercial terms but never the material or its lineage', async () => {
    const { orderLines, po } = await harness();
    const line = await orderLines.addLine({ poId: po.id, material: 'CAM-1', quantity: 10, unitPrice: 450 });
    const edited = await orderLines.editLine(line.id, { quantity: 12, unitPrice: 460 });
    expect(edited).toMatchObject({
      id: line.id, quantity: 12, unitPrice: 460,
      materialId: line.materialId, materialCode: line.materialCode, uom: line.uom, sourceType: 'direct',
    });
    expect(edited.createdAt).toBe(line.createdAt);
  });
});

describe('the requisition’s lines travel onto the order it drafts', () => {
  async function approvedRequisition() {
    const h = await harness();
    const pr = await h.prs.create({ tenantId: 't1', title: 'Containment', value: 0, projectId: 'proj-1', createdBy: 'u-buyer' });
    await h.requestLines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 12, estimatedUnitCost: 450 });
    await h.requestLines.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 250, estimatedUnitCost: 4 });
    await h.prs.changeStatus(pr.id, 'approved', 'u-manager');
    const orders = await h.poStore.list({ tenantId: 't1' });
    const drafted = orders.find((o) => o.title.includes('Containment'))!;
    return { ...h, pr, drafted };
  }

  it('carries every line WITHOUT RETYPING — identity, description, quantity and coding', async () => {
    const { orderLines, drafted } = await approvedRequisition();
    const lines = await orderLines.listLines(drafted.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      materialId: 'mat-CAM-1', materialCode: 'CAM-1', uom: 'nr', quantity: 12, unitPrice: 450, lineNo: 1,
    });
    // The unit travelled with the material: cable is metres, not the camera's `nr`.
    expect(lines[1]).toMatchObject({ materialCode: 'CBL-CAT6', uom: 'm', quantity: 250, unitPrice: 4 });
  });

  it('records each order line against the requisition line it answers', async () => {
    const { orderLines, requestLines, pr, drafted } = await approvedRequisition();
    const demand = await requestLines.listLines(pr.id);
    const lines = await orderLines.listLines(drafted.id);
    expect(lines.map((l) => l.sourcePrLineId)).toEqual(demand.map((d) => d.id));
  });

  it('calls the lineage DIRECT — a requisition is demand, not sourcing', async () => {
    const { orderLines, drafted } = await approvedRequisition();
    // Calling this "sourced" because a requisition exists would be the exact false claim the
    // domain refuses: nothing here was quoted, compared or selected.
    expect((await orderLines.summary(drafted.id)).provenance).toBe('direct');
  });

  it('agrees with the requisition on the total, because both derive it the same way', async () => {
    const { orderLines, poStore, drafted } = await approvedRequisition();
    expect((await orderLines.summary(drafted.id)).total.value).toBe(6400);
    expect((await poStore.get(drafted.id))?.value).toBe(6400);
  });

  it('is idempotent on replay — a redelivered approval does not order the same material twice', async () => {
    const { orderLines, pr, drafted } = await approvedRequisition();
    const again = await orderLines.carryRequisitionLines(drafted.id, pr.id);
    expect(again).toHaveLength(0);
    expect(await orderLines.listLines(drafted.id)).toHaveLength(2);
  });

  it('answers the requisition side of the lineage: was this demand ever bought?', async () => {
    const { orderLines, requestLines, pr, poLineStore } = await approvedRequisition();
    const demand = await requestLines.listLines(pr.id);
    const bought = await poLineStore.listForRequestLines(demand.map((d) => d.id), 't1');
    expect(bought).toHaveLength(2);
    expect(await poLineStore.listForRequestLines(['prl-never'], 't1')).toHaveLength(0);
  });
});
