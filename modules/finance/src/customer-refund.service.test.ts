import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { CustomerRefundService } from './customer-refund.service';
import { InMemoryCustomerRefundStore } from './in-memory-customer-refund-store';

const TENANT = 't1';

function harness() {
  const store = new InMemoryCustomerRefundStore();
  const append = vi.fn().mockResolvedValue(undefined);
  const svc = new CustomerRefundService(store, { append } as unknown as EventStore);
  return { store, svc, append };
}

const emitted = (append: ReturnType<typeof vi.fn>): string[] =>
  append.mock.calls.flatMap((c) => (c[0] as Array<{ type: string }>).map((e) => e.type));

const input = (number = 'RF-1', amount = 500) => ({
  tenantId: TENANT, refundNumber: number, customerName: 'Acme', reason: 'over-payment', amount, refundDate: '2026-02-01',
});

describe('CustomerRefundService', () => {
  it('drafts then pays a refund, emitting the GL trigger', async () => {
    const { svc, append } = harness();
    const r = await svc.create(input());
    expect(r.status).toBe('draft');
    const paid = await svc.pay(r.id);
    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeTruthy();
    expect(emitted(append)).toContain('finance.customer_refund.paid');
  });

  it('rejects a non-positive amount', async () => {
    const { svc } = harness();
    await expect(svc.create(input('RF-2', 0))).rejects.toThrow(/positive/);
  });

  it('rejects a duplicate refund number', async () => {
    const { svc } = harness();
    await svc.create(input('RF-DUP'));
    await expect(svc.create(input('RF-DUP'))).rejects.toThrow(/already exists/);
  });

  it('cannot pay a refund twice', async () => {
    const { svc } = harness();
    const r = await svc.create(input());
    await svc.pay(r.id);
    await expect(svc.pay(r.id)).rejects.toThrow(/only a draft refund can be paid/);
  });

  it('cannot cancel a paid refund', async () => {
    const { svc } = harness();
    const r = await svc.create(input());
    await svc.pay(r.id);
    await expect(svc.cancel(r.id)).rejects.toThrow(/cannot cancel a paid refund/);
  });

  it('can cancel a draft refund', async () => {
    const { svc } = harness();
    const r = await svc.create(input());
    expect((await svc.cancel(r.id)).status).toBe('cancelled');
  });
});
