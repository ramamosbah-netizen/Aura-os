import { describe, expect, it, vi } from 'vitest';
import { RfqService } from './rfq.service';
import type { Rfq, RfqQuote } from './domain/rfq';
import { makePurchaseOrder, type NewPurchaseOrder } from './domain/purchase-order';

/**
 * PROC-GAP-03 — awarding an RFQ raises the purchase order that closes the sourcing chain.
 *
 * Before this, award marked the winning quote and closed the RFQ and stopped there: PR → RFQ → ? →
 * PO → GRN had a hole in the middle, and a PO carried no way back to the RFQ it came from. This pins
 * the fix: the winning quote becomes a PO, carrying the RFQ and the purchase request as lineage, the
 * supplier and awarded amount from the quote, and the project resolved from the request.
 */

const tenantId = 't1';
const projectId = 'proj-1';

const winner: RfqQuote = { id: 'q-win', rfqId: 'r1', supplierName: 'Acme Cables', amount: 4200, status: 'received' } as RfqQuote;
const loser: RfqQuote = { id: 'q-lose', rfqId: 'r1', supplierName: 'Gulf Cables', amount: 5000, status: 'received' } as RfqQuote;
const rfq: Rfq = {
  id: 'r1', tenantId, companyId: null, reference: 'RFQ-001', title: 'Cat-6A cabling',
  prId: 'pr-1', prTitle: 'Cabling material', status: 'sent', dueDate: '2026-09-01',
  ownerId: null, createdAt: '2026-08-01T00:00:00.000Z', createdBy: null,
};

function build() {
  const quotes = [winner, loser];
  const created: NewPurchaseOrder[] = [];
  const purchaseOrders = { create: vi.fn(async (input: NewPurchaseOrder) => { created.push(input); return makePurchaseOrder(input); }) };
  const svc = new RfqService(
    {
      get: async () => rfq,
      listQuotes: async () => quotes,
      update: vi.fn(async () => undefined),
      updateQuote: vi.fn(async (q: RfqQuote) => { const i = quotes.findIndex((x) => x.id === q.id); quotes[i] = q; }),
    } as never,
    { append: vi.fn(async () => undefined), appendWithClient: vi.fn() } as never,
    {} as never, // access — not exercised by award
    { boundTenantId: () => tenantId } as never,
    { get: async (id: string) => ({ id, projectId, projectName: 'Marina Tower' }) } as never,
    purchaseOrders as never,
  );
  return { svc, purchaseOrders, created };
}

describe('RfqService.award — PROC-GAP-03', () => {
  it('raises a PO from the winning quote, carrying the RFQ and PR as lineage', async () => {
    const { svc, purchaseOrders, created } = build();

    const { rfq: awarded, po } = await svc.award('r1', 'q-win', 'buyer-1');

    expect(awarded.status).toBe('awarded');
    expect(purchaseOrders.create).toHaveBeenCalledTimes(1);
    expect(po, 'the award must yield a PO').not.toBeNull();

    // The PO carries the sourcing lineage and the awarded commercials.
    expect(created[0]).toMatchObject({
      rfqId: 'r1',
      prId: 'pr-1',
      projectId,               // resolved from the purchase request, not a cross-module join
      projectName: 'Marina Tower',
      supplierName: 'Acme Cables',
      value: 4200,             // the WINNING amount, not the lowest loser
    });
    expect(po!.rfqId).toBe('r1');
    expect(po!.value).toBe(4200);
  });

  it('is a no-op for the PO when no purchase-order service is bound (award still closes the RFQ)', async () => {
    const svc = new RfqService(
      { get: async () => rfq, listQuotes: async () => [winner], update: vi.fn(async () => undefined), updateQuote: vi.fn(async () => undefined) } as never,
      { append: vi.fn(async () => undefined), appendWithClient: vi.fn() } as never,
      {} as never,
      { boundTenantId: () => tenantId } as never,
      { get: async () => null } as never,
      // no PurchaseOrderService
    );
    const { po, rfq: awarded } = await svc.award('r1', 'q-win');
    expect(awarded.status).toBe('awarded');
    expect(po).toBeNull();
  });
});
