import { describe, expect, it } from 'vitest';
import { cancellationPosition, closureReadiness, issuability, type OrderPosition } from './purchase-order-lifecycle';
import type { PurchaseOrder, PurchaseOrderStatus } from './purchase-order';
import type { OrderReceipt } from './order-receipt';

/**
 * J3-01 — the conditions, before any of them reaches a route.
 *
 * The finding was recorded as "update-only actor can set status=approved" and that string has been
 * refused for a while. It stayed open because the refusal patched a value in a list, and the shape
 * underneath — one generic endpoint owning four business acts — kept letting a Buyer issue, cancel
 * and close orders they had no authority over. These are the conditions that replace it.
 */

const order = (status: PurchaseOrderStatus): Pick<PurchaseOrder, 'status' | 'reference' | 'id'> =>
  ({ status, reference: 'PO-2026-000001', id: 'po-1' });

const position = (over: Partial<OrderPosition> = {}): OrderPosition =>
  ({ receivedValue: 0, invoicedValue: 0, receipt: null, ...over });

const receipt = (lines: Array<{ ordered: number; accepted: number }>): OrderReceipt => {
  const built = lines.map((l, i) => ({
    poLineId: `l${i}`, lineNo: i + 1, materialCode: `MAT-${i}`, materialName: `Material ${i}`,
    uom: 'nr', ordered: l.ordered, accepted: l.accepted, rejected: 0,
    outstanding: Math.max(0, l.ordered - l.accepted), outstandingValue: 0,
    settled: l.accepted >= l.ordered, overReceived: l.accepted > l.ordered, sourceType: 'sourced' as const,
  }));
  return {
    lines: built,
    fullyReceived: built.length > 0 && built.every((l) => l.settled),
    anyReceived: built.some((l) => l.accepted > 0),
  } as OrderReceipt;
};

describe('issuing', () => {
  it('is reachable ONLY from approved — there is no draft → issued at any value', () => {
    // The old path allowed it whenever the value fell under the auto-approve threshold, which read
    // as "small orders need no approval" and meant "small orders are issued with no approval fact
    // anywhere": no approver, no time, no record the threshold was consulted.
    for (const status of ['draft', 'pending_approval'] as PurchaseOrderStatus[]) {
      const v = issuability(order(status));
      expect(v.allowed, `${status} must not reach issued`).toBe(false);
      if (!v.allowed) expect(v.reason).toBe('not_approved');
    }
    expect(issuability(order('approved')).allowed).toBe(true);
  });

  it('refuses a second issue, and anything terminal', () => {
    for (const [status, reason] of [['issued', 'already_issued'], ['cancelled', 'terminal'], ['closed', 'terminal']] as const) {
      const v = issuability(order(status));
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe(reason);
    }
  });
});

describe('cancelling', () => {
  const COMMITTED = 10_000;

  it('requires a reason — it reverses a commitment somebody approved', () => {
    for (const reason of [undefined, null, '   ']) {
      const v = cancellationPosition(order('issued'), COMMITTED, position(), reason);
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe('reason_required');
    }
  });

  it('cancels the WHOLE commitment when nothing has happened yet', () => {
    const v = cancellationPosition(order('approved'), COMMITTED, position(), 'the project was descoped');
    expect(v).toMatchObject({ allowed: true, committed: 10_000, settled: 0, cancellable: 10_000 });
  });

  /**
   * THE CASE THE RECORD TURNS ON. Reversing the whole commitment on a part-delivered order would say
   * the company never committed to goods that are standing in its store, and the cost line would
   * drop by more than the order ever put on it.
   */
  it('cancels only what is LEFT when the order is part received', () => {
    const v = cancellationPosition(order('partially_received'), COMMITTED, position({ receivedValue: 4_000 }), 'the rest is no longer needed');
    expect(v).toMatchObject({ allowed: true, settled: 4_000, cancellable: 6_000 });
  });

  it('counts an invoice as settled too, and takes the GREATER of the two measures', () => {
    // Invoiced ahead of receipt within tolerance, or received ahead of invoicing: either makes that
    // part of the order no longer cancellable, and taking the greater refuses to pick a convenient
    // one.
    expect(cancellationPosition(order('issued'), COMMITTED, position({ receivedValue: 3_000, invoicedValue: 3_000 }), 'x'))
      .toMatchObject({ settled: 3_000, cancellable: 7_000 });
    expect(cancellationPosition(order('issued'), COMMITTED, position({ receivedValue: 6_000, invoicedValue: 2_000 }), 'x'))
      .toMatchObject({ settled: 6_000, cancellable: 4_000 });
  });

  it('refuses when nothing remains — a delivered order is closed, not cancelled', () => {
    const v = cancellationPosition(order('received'), COMMITTED, position({ receivedValue: 10_000, invoicedValue: 10_000 }), 'changed my mind');
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.reason).toBe('nothing_left_to_cancel');
      expect(v.detail).toMatch(/An order that has been delivered is closed, not cancelled/);
    }
  });

  it('refuses an order invoiced BEYOND what arrived, rather than compounding it', () => {
    // Somebody has billed for more than was delivered. That is a live dispute; reversing a
    // commitment while an invoice stands against it makes the position harder to unpick, not easier.
    const v = cancellationPosition(order('issued'), COMMITTED, position({ receivedValue: 2_000, invoicedValue: 5_000 }), 'x');
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe('invoiced_beyond_receipt');
  });

  it('refuses a second cancellation', () => {
    const v = cancellationPosition(order('cancelled'), COMMITTED, position(), 'again');
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe('terminal');
  });
});

describe('closing', () => {
  it('is not available before the order has gone out', () => {
    for (const status of ['draft', 'pending_approval', 'approved'] as PurchaseOrderStatus[]) {
      const v = closureReadiness(order(status), position());
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe('not_issued');
    }
  });

  it('refuses while any quantity is still outstanding', () => {
    const v = closureReadiness(order('partially_received'), position({ receipt: receipt([{ ordered: 10, accepted: 4 }]) }));
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.reason).toBe('quantity_outstanding');
      expect(v.detail).toMatch(/6 nr of 10/);
    }
  });

  it('refuses while received goods are not yet invoiced — that is a liability, not a detail', () => {
    const v = closureReadiness(
      order('received'),
      position({ receivedValue: 10_000, invoicedValue: 6_000, receipt: receipt([{ ordered: 10, accepted: 10 }]) }),
    );
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.reason).toBe('receipt_not_invoiced');
      expect(v.detail).toMatch(/4000 of received goods has not been invoiced/);
    }
  });

  it('closes when everything arrived and everything was billed', () => {
    const v = closureReadiness(
      order('received'),
      position({ receivedValue: 10_000, invoicedValue: 10_000, receipt: receipt([{ ordered: 10, accepted: 10 }]) }),
    );
    expect(v.allowed).toBe(true);
  });

  it('lets an order with NO LINES close on the value test alone', () => {
    // The legacy shape. An order whose data cannot answer "is anything outstanding" must not be
    // trapped open forever by a question it cannot be asked.
    const v = closureReadiness(order('issued'), position({ receivedValue: 500, invoicedValue: 500, receipt: null }));
    expect(v.allowed).toBe(true);
  });

  /**
   * CLOSING AND CANCELLING ARE DIFFERENT ACTS, and this is the assertion that says so: the same
   * order is closable and NOT cancellable, because everything arrived. Treating close as a variant
   * of cancel would have made one of these wrong.
   */
  it('is available exactly where cancellation is not', () => {
    const settled = position({ receivedValue: 10_000, invoicedValue: 10_000, receipt: receipt([{ ordered: 10, accepted: 10 }]) });
    expect(closureReadiness(order('received'), settled).allowed).toBe(true);
    expect(cancellationPosition(order('received'), 10_000, settled, 'a reason').allowed).toBe(false);
  });
});
