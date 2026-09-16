import { describe, it, expect, vi } from 'vitest';
import type { AccessService, ApprovalMatrixService, EventStore, TenantContext, TxRunner, CommandBus, NumberingService, AuditService } from '@aura/core';
import { PurchaseRequestService } from './purchase-request.service';
import { PurchaseRequestLineService, type MaterialCatalogue, type MaterialCitation } from './purchase-request-line.service';
import { PurchaseOrderService } from './purchase-order.service';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { InMemoryPurchaseRequestLineStore } from './in-memory-purchase-request-line-store';
import { InMemoryPurchaseOrderStore } from './in-memory-purchase-order-store';
import { InMemorySupplierStore } from './in-memory-supplier-store';

/**
 * The value that GOVERNS a requisition.
 *
 * Slice 1 derived it and proved it read correctly. It did not make anything obey it, and that left
 * two separate holes on the same fact:
 *
 *   · the completeness rule was reported by the summary endpoint and enforced nowhere, so an
 *     unpriced requisition could still be sent for a decision;
 *
 *   · and the approval matrix still resolved on the HEADER, which a line-based requisition leaves
 *     at 0 — so a 6,400 requisition matched no threshold rule and needed no approver at all.
 *
 * The second is the sharper one, because it is the same defect as the first arriving through a
 * different door: a smaller number buying a weaker approval.
 */

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
/** The same shape the module's other suite uses: a bus that actually runs its handlers. */
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

class FakeCatalogue implements MaterialCatalogue {
  async citeMaterial(reference: string): Promise<MaterialCitation> {
    return {
      materialId: `mat-${reference}`, materialCode: reference, materialName: `${reference} material`,
      specification: null, manufacturer: null, model: null, uom: 'nr',
    };
  }
}

const tenant = {
  get: () => ({ tenantId: 't1', companyId: null, actorId: 'u-buyer', correlationId: 'test' }),
  boundTenantId: () => 't1',
} as unknown as TenantContext;

/**
 * @param threshold  the approval rule this tenant has, or null for none.
 * @param allowed    the permissions the acting user holds.
 */
async function harness(opts: {
  threshold?: { min: number; approvers: string[] } | null;
  allowed?: string[];
} = {}) {
  const asked: string[] = [];
  const allowed = opts.allowed ?? ['procurement.pr.create', 'procurement.pr.update', 'procurement.pr.approve'];
  const access = {
    assert: (_actor: string, target: { permission: string }) => {
      asked.push(target.permission);
      if (!allowed.includes(target.permission)) throw new Error(`denied: ${target.permission}`);
    },
  } as unknown as AccessService;

  const matrixResolved: Array<number | undefined> = [];
  const approvalMatrix = {
    resolve: async (_t: string, _kind: string, ctx: { value?: number }) => {
      matrixResolved.push(ctx.value);
      const rule = opts.threshold;
      if (!rule || (ctx.value ?? 0) < rule.min) return null;
      return { ruleLabel: `over ${rule.min}`, approvers: rule.approvers };
    },
  } as unknown as ApprovalMatrixService;

  const prStore = new InMemoryPurchaseRequestStore();
  const lineStore = new InMemoryPurchaseRequestLineStore();
  const poStore = new InMemoryPurchaseOrderStore();
  const poService = new PurchaseOrderService(poStore, events, tx, fakeBus(), numbering, audit, new InMemorySupplierStore());
  poService.onModuleInit();

  const prs = new PurchaseRequestService(prStore, events, access, poService, approvalMatrix, tenant, lineStore);
  const lines = new PurchaseRequestLineService(lineStore, prStore, new FakeCatalogue(), null, tenant);

  const pr = await prs.create({ tenantId: 't1', title: 'Containment materials', value: 0, createdBy: 'u-buyer' });
  return { prs, lines, prStore, poStore, pr, asked, matrixResolved };
}

describe('an incomplete requisition cannot ask for a decision', () => {
  it('refuses to submit while a line is unpriced, naming the line', async () => {
    const { prs, lines, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    await lines.addLine({ prId: pr.id, material: 'CBL-1', quantity: 250 });

    await expect(prs.changeStatus(pr.id, 'submitted', 'u-buyer'))
      .rejects.toThrow(/decides who may approve it/);
  });

  it('refuses to APPROVE an incomplete requisition too — a draft can be approved directly', async () => {
    const { prs, lines, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    await lines.addLine({ prId: pr.id, material: 'CBL-1', quantity: 250 });

    await expect(prs.changeStatus(pr.id, 'approved', 'u-manager'))
      .rejects.toThrow(/decides who may approve it/);
  });

  it('allows submission once every line is priced', async () => {
    const { prs, lines, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    expect((await prs.changeStatus(pr.id, 'submitted', 'u-buyer')).status).toBe('submitted');
  });

  it('leaves a LEGACY requisition with no lines exactly as it was', async () => {
    // Refusing these would invalidate historical records rather than improve any of them.
    const { prs, pr } = await harness();
    expect((await prs.changeStatus(pr.id, 'submitted', 'u-buyer')).status).toBe('submitted');
  });
});

describe('the approval matrix reads the value the lines establish', () => {
  it('resolves on the DERIVED value, not the header a line-based requisition leaves at zero', async () => {
    const { prs, lines, pr, matrixResolved } = await harness({
      threshold: { min: 5000, approvers: ['u-manager'] },
    });
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 640 });

    // The header was authored as 0. Reading it here is what let a 6,400 requisition need no approver.
    await expect(prs.changeStatus(pr.id, 'approved', 'u-buyer'))
      .rejects.toThrow(/approval requires an authorised approver/);
    expect(matrixResolved.at(-1)).toBe(6400);
  });

  it('lets the authorised approver through on that same derived value', async () => {
    const { prs, lines, pr } = await harness({ threshold: { min: 5000, approvers: ['u-manager'] } });
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 640 });
    expect((await prs.changeStatus(pr.id, 'approved', 'u-manager')).status).toBe('approved');
  });

  it('still reads the authored header for a requisition with no lines', async () => {
    const { prs, prStore, pr, matrixResolved } = await harness({ threshold: { min: 5000, approvers: ['u-manager'] } });
    await prStore.update({ ...pr, value: 7500 });
    await expect(prs.changeStatus(pr.id, 'approved', 'u-buyer')).rejects.toThrow(/authorised approver/);
    expect(matrixResolved.at(-1)).toBe(7500);
  });
});

describe('one requisition, one total', () => {
  it('keeps the persisted header in step with the lines as they are authored', async () => {
    const { lines, prStore, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    expect((await prStore.get(pr.id))?.value).toBe(4500);

    await lines.addLine({ prId: pr.id, material: 'CBL-1', quantity: 250, estimatedUnitCost: 4 });
    expect((await prStore.get(pr.id))?.value).toBe(5500);
  });

  it('drops the header to zero while a line is unpriced rather than leaving a stale number', async () => {
    const { lines, prStore, pr } = await harness();
    await prStore.update({ ...pr, value: 999_999 });
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 1 });
    // 999,999 was never about these lines. Zero says "nothing established yet", and the requisition
    // cannot be submitted or approved in that state, so nothing acts on it.
    expect((await prStore.get(pr.id))?.value).toBe(0);
  });

  it('follows a removal back down', async () => {
    const { lines, prStore, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    const second = await lines.addLine({ prId: pr.id, material: 'CBL-1', quantity: 250, estimatedUnitCost: 4 });
    await lines.removeLine(second.id);
    expect((await prStore.get(pr.id))?.value).toBe(4500);
  });

  it('drafts the purchase order from the value the lines establish', async () => {
    const { prs, lines, poStore, pr } = await harness();
    await lines.addLine({ prId: pr.id, material: 'CAM-1', quantity: 10, estimatedUnitCost: 450 });
    await prs.changeStatus(pr.id, 'approved', 'u-manager');

    const pos = await poStore.list({ tenantId: 't1' });
    expect(pos).toHaveLength(1);
    // The PO used to inherit the header — drafting a 0 order that then commits 0 to the cost ledger.
    expect(pos[0].value).toBe(4500);
  });
});

describe('sending for a decision is not the same authority as making one', () => {
  it('lets somebody who can only UPDATE submit their own requisition', async () => {
    const { prs, pr, asked } = await harness({ allowed: ['procurement.pr.create', 'procurement.pr.update'] });
    expect((await prs.changeStatus(pr.id, 'submitted', 'u-buyer')).status).toBe('submitted');
    expect(asked.at(-1)).toBe('procurement.pr.update');
  });

  it('refuses that same person the approval', async () => {
    const { prs, pr } = await harness({ allowed: ['procurement.pr.create', 'procurement.pr.update'] });
    await expect(prs.changeStatus(pr.id, 'approved', 'u-buyer')).rejects.toThrow(/denied: procurement.pr.approve/);
  });

  it('refuses them the rejection too — deciding against is still deciding', async () => {
    const { prs, pr } = await harness({ allowed: ['procurement.pr.create', 'procurement.pr.update'] });
    await expect(prs.changeStatus(pr.id, 'rejected', 'u-buyer')).rejects.toThrow(/denied: procurement.pr.approve/);
  });

  it('asks for the approval permission when an approver approves', async () => {
    const { prs, pr, asked } = await harness();
    await prs.changeStatus(pr.id, 'approved', 'u-manager');
    expect(asked.at(-1)).toBe('procurement.pr.approve');
  });
});
