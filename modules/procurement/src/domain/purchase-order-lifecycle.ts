import { moneyNumber } from '@aura/shared';
import type { PurchaseOrder, PurchaseOrderStatus } from './purchase-order';
import type { OrderReceipt } from './order-receipt';

/**
 * J3-01 — WHO MAY MOVE A PURCHASE ORDER'S LIFE, AND ON WHAT CONDITIONS.
 *
 * The defect this exists to close was recorded as "an update-only actor can set status=approved".
 * That string was refused long ago, and the record stayed open because the refusal patched a VALUE
 * in a list rather than the shape that produced it: one generic `PATCH /status` endpoint, governed
 * by one permission (`procurement.po.update`), owning four different business acts. Executed against
 * the running API, a Buyer holding only `update` could still:
 *
 *   issue an order of 4,000 to a supplier          — nobody had approved anything
 *   cancel a Director-approved order of 90,000     — reversing its committed cost in the ledger
 *   close a Director-approved order of 90,000      — declaring it finished
 *
 * So the rule is not "refuse the word approved". It is: A GENERIC MUTATION PATH MUST NEVER OWN A
 * GOVERNED LIFECYCLE TRANSITION. Each act below is its own command, with its own authority and its
 * own conditions, and this file holds the conditions — framework-free, so they are testable without
 * a database and cannot differ between the API, a reactor and a script.
 *
 * ISSUING, CANCELLING AND CLOSING ARE THREE DIFFERENT KINDS OF ACT, and the most important decision
 * here is that they are not variations of one:
 *
 *   ISSUE   sends the commitment OUT. It is only reachable from an approved order — there is no
 *           `draft → issued`, at any value. A small order below the approval threshold is not one
 *           nobody approved; it is one APPROVED AUTOMATICALLY, which is a fact that gets recorded.
 *   CANCEL  UNDOES a commitment, so it needs the authority that commitment needed and a reason —
 *           and it may only undo what is still undoable. An order half delivered has half become
 *           real, and reversing all of it would erase a commitment that goods now stand against.
 *   CLOSE   is neither. It is OPERATIONAL COMPLETION: the order did what it was for. It has no
 *           business asking for approval authority, and it has no business being possible while
 *           something is still outstanding against it.
 */

/** What has already happened against an order, gathered from Inventory and Finance. */
export interface OrderPosition {
  /** Ex-tax value of ACCEPTED receipts. */
  receivedValue: number;
  /** Ex-tax value of invoices that are not cancelled. */
  invoicedValue: number;
  /** Line-by-line delivery, or null when the order has no lines to measure. */
  receipt: OrderReceipt | null;
}

export type LifecycleRefusal =
  | 'not_approved'
  | 'already_issued'
  | 'terminal'
  | 'nothing_left_to_cancel'
  | 'invoiced_beyond_receipt'
  | 'reason_required'
  | 'not_issued'
  | 'quantity_outstanding'
  | 'receipt_not_invoiced';

export type LifecycleRefused = { allowed: false; reason: LifecycleRefusal; detail: string };
export type LifecycleVerdict<T = unknown> =
  | ({ allowed: true } & (T extends unknown ? T : never))
  | LifecycleRefused;

const refuse = (reason: LifecycleRefusal, detail: string): LifecycleRefused =>
  ({ allowed: false, reason, detail });

/** The statuses from which nothing further may be done. */
const TERMINAL: ReadonlyArray<PurchaseOrderStatus> = ['closed', 'cancelled'];

/**
 * MAY THIS ORDER BE ISSUED?
 *
 * Only from `approved`, and that is the whole rule. The old path allowed `draft → issued` whenever
 * the value fell under the auto-approve threshold, which read as "small orders need no approval" and
 * meant something quite different in practice: small orders were issued with NO APPROVAL FACT
 * ANYWHERE — no approver, no time, no record that the threshold had even been consulted. The
 * threshold now decides WHO approves (nobody, automatically) rather than WHETHER the step happens,
 * so every issued order can say when it was approved and on what basis.
 */
export function issuability(order: Pick<PurchaseOrder, 'status' | 'reference' | 'id'>): LifecycleVerdict<unknown> {
  if (order.status === 'issued') {
    return refuse('already_issued', `purchase order ${order.reference ?? order.id} has already been issued`);
  }
  if (TERMINAL.includes(order.status)) {
    return refuse('terminal', `a ${order.status} purchase order cannot be issued`);
  }
  if (order.status !== 'approved') {
    return refuse(
      'not_approved',
      `a ${order.status} purchase order cannot be issued — it must be approved first, and an order ` +
      'below the approval threshold is approved automatically rather than skipping the step',
    );
  }
  return { allowed: true };
}

/**
 * WHAT MAY STILL BE CANCELLED, AND WHAT MUST NOT BE.
 *
 * The committed cost a purchase order put on a cost line is reversed when it is cancelled — a
 * negative ledger entry, because the ledger is append-only. Reversing the WHOLE commitment on an
 * order that has been part delivered would say the company never committed to goods that are
 * standing in its store, and the cost line would drop by more than the order ever released.
 *
 * So cancellation is bounded by what has already become real. `settled` is the greater of what has
 * been received and what has been invoiced — either measure makes that part of the order no longer
 * cancellable, and taking the greater refuses to pick a convenient one.
 *
 * TWO CASES REFUSE OUTRIGHT rather than cancelling a remainder:
 *
 *   nothing remains          a fully delivered order is COMPLETE, not cancellable. It is closed.
 *   invoiced beyond receipt  somebody has billed for more than arrived. That is a live dispute and
 *                            an inconsistent accounting state; cancelling on top of it would reverse
 *                            a commitment while an invoice stands against it. It is named and
 *                            refused rather than compounded.
 */
export function cancellationPosition(
  order: Pick<PurchaseOrder, 'status' | 'reference' | 'id'>,
  committed: number,
  position: OrderPosition,
  reason: string | null | undefined,
): LifecycleVerdict<{ committed: number; settled: number; cancellable: number }> {
  if (TERMINAL.includes(order.status)) {
    return refuse('terminal', `this purchase order is already ${order.status}`);
  }
  if (!reason?.trim()) {
    return refuse(
      'reason_required',
      'cancelling a purchase order must record why — it reverses a commitment somebody approved',
    );
  }

  const received = moneyNumber(Math.max(0, position.receivedValue));
  const invoiced = moneyNumber(Math.max(0, position.invoicedValue));

  if (invoiced > received + 0.01) {
    return refuse(
      'invoiced_beyond_receipt',
      `this purchase order has been invoiced ${invoiced} against ${received} received, so its ` +
      'accounting position is unresolved — settle the over-invoicing before cancelling it',
    );
  }

  const settled = moneyNumber(Math.max(received, invoiced));
  const cancellable = moneyNumber(Math.max(0, committed - settled));

  if (cancellable <= 0) {
    return refuse(
      'nothing_left_to_cancel',
      `nothing remains to cancel: ${settled} of ${committed} has already been received or invoiced. ` +
      'An order that has been delivered is closed, not cancelled',
    );
  }
  return { allowed: true, committed: moneyNumber(committed), settled, cancellable };
}

/**
 * MAY THIS ORDER BE CLOSED?
 *
 * Closing is an OPERATIONAL COMPLETION act, and treating it as a variant of cancelling was the
 * mistake worth naming: cancelling asks "may this person undo a commitment", closing asks "is this
 * order finished". They share neither authority nor conditions.
 *
 * Finished means all three of:
 *
 *   NOTHING OUTSTANDING TO DELIVER   an order still expecting goods is not complete. A rejected
 *                                    quantity leaves the line outstanding too, which is how a
 *                                    pending return keeps the order open without a separate model.
 *   NOTHING UNBILLED                 goods received and not yet invoiced is an open liability
 *                                    (GRNI). Closing over it hides a debt the company owes.
 *   NOTHING OVERBILLED               the same unresolved dispute cancellation refuses.
 *
 * An order with NO LINES cannot be measured for delivery — the legacy shape — and is allowed to
 * close on the value test alone rather than being trapped open forever by a question its data
 * cannot answer.
 */
export function closureReadiness(
  order: Pick<PurchaseOrder, 'status' | 'reference' | 'id'>,
  position: OrderPosition,
): LifecycleVerdict<unknown> {
  if (TERMINAL.includes(order.status)) {
    return refuse('terminal', `this purchase order is already ${order.status}`);
  }
  if (order.status !== 'issued' && order.status !== 'partially_received' && order.status !== 'received') {
    return refuse(
      'not_issued',
      `a ${order.status} purchase order cannot be closed — closing records that an order which went ` +
      'out has been completed, and this one has not gone out',
    );
  }

  if (position.receipt && position.receipt.lines.length > 0 && !position.receipt.fullyReceived) {
    const outstanding = position.receipt.lines.filter((l) => !l.settled);
    return refuse(
      'quantity_outstanding',
      `${outstanding.length} line(s) are still outstanding — ` +
      outstanding.slice(0, 3).map((l) => `${l.materialCode}: ${l.outstanding} ${l.uom} of ${l.ordered}`).join('; ') +
      '. An order still expecting delivery is not complete',
    );
  }

  const received = moneyNumber(Math.max(0, position.receivedValue));
  const invoiced = moneyNumber(Math.max(0, position.invoicedValue));
  if (Math.abs(received - invoiced) > 0.01) {
    return refuse(
      'receipt_not_invoiced',
      invoiced < received
        ? `${moneyNumber(received - invoiced)} of received goods has not been invoiced yet, which is a ` +
          'liability the company still owes — closing the order would hide it'
        : `this purchase order has been invoiced ${invoiced} against ${received} received; settle that ` +
          'before closing it',
    );
  }
  return { allowed: true };
}
