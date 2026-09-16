import { moneyNumber, type Id } from '@aura/shared';
import type { PurchaseOrderLine, PurchaseOrderLineSource } from './purchase-order-line';
import type { PurchaseOrderStatus } from './purchase-order';

/**
 * Where a purchase order actually stands on delivery — line by line.
 *
 * `BUY-05` records the defect this replaces: receiving one item of an order for a hundred marked
 * the whole order received. Wave 4 iteration 2 contained it by refusing to conclude anything from
 * an unknown quantity, which stopped the false completion but could not produce the true answer —
 * because the order had one scalar quantity and no items, so "99 still outstanding" had nothing to
 * be outstanding ON.
 *
 * This is the real answer, and it is per line by necessity rather than by preference. An order for
 * twelve cameras and 250 metres of cable is not fractionally received; it is a set of positions,
 * each of which is either settled or still owed, and the order is finished only when every one of
 * them is. A single percentage across the order would say "70% received" and leave nobody able to
 * tell which materials to chase.
 *
 * ACCEPTED IS NOT DELIVERED. A rejected quantity arrived, was looked at and was sent back: it is a
 * fact about the delivery, not progress against the order. Counting it would close an order that
 * still owes the material, which is the same false completion in a politer form.
 */
export interface LineReceipt {
  poLineId: Id;
  lineNo: number;
  materialCode: string;
  materialName: string;
  uom: string;
  ordered: number;
  accepted: number;
  rejected: number;
  /** What is still owed. Never negative — an over-delivery does not create a negative debt. */
  outstanding: number;
  /** The money still committed on this line: what is owed, at the price it was ordered at. */
  outstandingValue: number;
  settled: boolean;
  /** More arrived than was ordered. Recorded rather than refused — it really happened. */
  overReceived: boolean;
  /** Carried so exposure can be read by how the line was bought, not only by supplier. */
  sourceType: PurchaseOrderLineSource;
}

export interface OrderReceipt {
  lines: LineReceipt[];
  /** Every line settled, and there is at least one. */
  fullyReceived: boolean;
  /** Something has arrived and been accepted. */
  anyReceived: boolean;
  /** The lines still owed — what a chase is made of. */
  outstanding: LineReceipt[];
  /** Total money still committed on this order. The exposure figure. */
  outstandingValue: number;
  /**
   * FALSE for an order with no lines.
   *
   * Such an order predates line-level receipt and has no positions to measure, so its delivery
   * state cannot be concluded from here at all. That is not the same as "nothing has arrived", and
   * every reader must treat it as unanswerable rather than as empty.
   */
  determinable: boolean;
}

/** Accepted quantity per order line, summed across every receipt note. */
export type AcceptedByLine = Readonly<Record<string, number>>;
export type RejectedByLine = Readonly<Record<string, number>>;

export function receiptOf(
  orderLines: PurchaseOrderLine[],
  accepted: AcceptedByLine,
  rejected: RejectedByLine = {},
): OrderReceipt {
  const lines: LineReceipt[] = orderLines.map((l) => {
    const got = Math.max(0, Number(accepted[l.id] ?? 0));
    const sentBack = Math.max(0, Number(rejected[l.id] ?? 0));
    const outstanding = Math.max(0, l.quantity - got);
    return {
      poLineId: l.id,
      lineNo: l.lineNo,
      materialCode: l.materialCode,
      materialName: l.materialName,
      uom: l.uom,
      ordered: l.quantity,
      accepted: got,
      rejected: sentBack,
      outstanding,
      outstandingValue: moneyNumber(outstanding * l.unitPrice),
      settled: got >= l.quantity,
      overReceived: got > l.quantity,
      sourceType: l.sourceType,
    };
  });

  const outstanding = lines.filter((l) => !l.settled);
  return {
    lines,
    fullyReceived: lines.length > 0 && outstanding.length === 0,
    anyReceived: lines.some((l) => l.accepted > 0),
    outstanding,
    outstandingValue: moneyNumber(outstanding.reduce((sum, l) => sum + l.outstandingValue, 0)),
    determinable: lines.length > 0,
  };
}

/**
 * The status this receipt position implies — or NULL when it implies nothing.
 *
 * NULL is returned in two different situations and both mean "do not move the order":
 *
 *   · the order has no lines, so its delivery state is not measurable here at all;
 *   · nothing has been accepted yet, so nothing about the order has changed.
 *
 * Returning a status in either case is how an order gets closed by an absence. The caller leaves
 * the order exactly where it is.
 */
export function receiptStatus(receipt: OrderReceipt): PurchaseOrderStatus | null {
  if (!receipt.determinable) return null;
  if (receipt.fullyReceived) return 'received';
  if (receipt.anyReceived) return 'partially_received';
  return null;
}

/**
 * A plain sentence for a person chasing a delivery.
 *
 * "1 of 100 received, 99 outstanding" is what `BUY-05` asks somebody to be able to see, and it is
 * assembled here rather than in a screen so the API, the event payload and the UI all say the same
 * thing in the same words.
 */
export function describeOutstanding(receipt: OrderReceipt): string {
  if (!receipt.determinable) return 'this order has no lines, so its delivery position cannot be measured';
  if (receipt.fullyReceived) return 'everything ordered has been received';
  const parts = receipt.outstanding.map(
    (l) => `line ${l.lineNo} (${l.materialCode}): ${l.accepted} of ${l.ordered} ${l.uom} received, ${l.outstanding} outstanding`,
  );
  return parts.join('; ');
}
