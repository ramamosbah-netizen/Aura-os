import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { CustomerInvoiceService } from './customer-invoice.service';
import { InMemoryCustomerInvoiceStore } from './in-memory-customer-invoice-store';

const TENANT = 't1';

function harness() {
  const store = new InMemoryCustomerInvoiceStore();
  const append = vi.fn().mockResolvedValue(undefined);
  const svc = new CustomerInvoiceService(store, { append } as unknown as EventStore, {} as never, {} as never, {} as never);
  return { store, svc };
}

/** Create + issue an invoice for Acme with the given net (5% VAT) and issue date. */
async function issued(svc: CustomerInvoiceService, number: string, net: number, issueDate: string) {
  const inv = await svc.create({
    tenantId: TENANT, invoiceNumber: number, customerName: 'Acme', issueDate,
    lines: [{ description: 'work', quantity: 1, unitPrice: net, vatRate: 5 }],
  });
  await svc.issue(inv.id);
  return inv;
}

describe('CustomerInvoiceService.allocateReceipt', () => {
  it('applies one receipt across invoices oldest-first, advancing each status', async () => {
    const { svc } = harness();
    const a = await issued(svc, 'AR-1', 1000, '2026-01-10'); // 1,050 gross
    const b = await issued(svc, 'AR-2', 1000, '2026-02-10'); // 1,050 gross

    // Pay 1,400 — clears AR-1 fully (1,050) and part-pays AR-2 (350).
    const result = await svc.allocateReceipt(TENANT, { customerName: 'Acme', amount: 1400 });

    expect(result.allocations.map((x) => [x.invoiceNumber, x.amount])).toEqual([['AR-1', 1050], ['AR-2', 350]]);
    expect(result.unapplied).toBe(0);
    expect((await svc.get(a.id))!.status).toBe('paid');
    const bAfter = await svc.get(b.id);
    expect(bAfter!.status).toBe('partially_paid');
    expect(bAfter!.amountPaid).toBe(350);
  });

  it('returns an over-payment as unapplied', async () => {
    const { svc } = harness();
    await issued(svc, 'AR-1', 1000, '2026-01-10'); // 1,050 gross
    const result = await svc.allocateReceipt(TENANT, { customerName: 'Acme', amount: 2000 });
    expect(result.totalAllocated).toBe(1050);
    expect(result.unapplied).toBe(950);
  });

  it('honours an explicit allocation split', async () => {
    const { svc } = harness();
    const a = await issued(svc, 'AR-1', 1000, '2026-01-10');
    const b = await issued(svc, 'AR-2', 1000, '2026-02-10');
    await svc.allocateReceipt(TENANT, {
      customerName: 'Acme', amount: 600,
      allocations: [{ invoiceId: a.id, amount: 200 }, { invoiceId: b.id, amount: 400 }],
    });
    expect((await svc.get(a.id))!.amountPaid).toBe(200);
    expect((await svc.get(b.id))!.amountPaid).toBe(400);
  });

  it('rejects an explicit allocation above an invoice balance', async () => {
    const { svc } = harness();
    const a = await issued(svc, 'AR-1', 1000, '2026-01-10'); // balance 1,050
    await expect(
      svc.allocateReceipt(TENANT, { customerName: 'Acme', amount: 2000, allocations: [{ invoiceId: a.id, amount: 1200 }] }),
    ).rejects.toThrow(/exceeds/);
  });

  it('errors when the customer has no open invoices', async () => {
    const { svc } = harness();
    await expect(svc.allocateReceipt(TENANT, { customerName: 'Nobody', amount: 100 })).rejects.toThrow(/no open invoices/);
  });

  it('previewAllocation does not write', async () => {
    const { svc } = harness();
    const a = await issued(svc, 'AR-1', 1000, '2026-01-10');
    const preview = await svc.previewAllocation(TENANT, 'Acme', 500);
    expect(preview.allocations[0].amount).toBe(500);
    expect((await svc.get(a.id))!.amountPaid).toBe(0); // untouched
  });
});
