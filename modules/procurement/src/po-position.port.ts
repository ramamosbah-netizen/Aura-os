import type { Id } from '@aura/shared';

/** DI token for the order-position port (J3-01). */
export const PO_POSITION_PORT = Symbol('PO_POSITION_PORT');

/**
 * WHAT HAS ALREADY HAPPENED AGAINST A PURCHASE ORDER — asked of the composition layer, because the
 * answer lives in two other modules (ADR-0004).
 *
 * Cancelling and closing both need it, for opposite reasons. Cancelling needs to know how much of
 * the order has become REAL, because that part can no longer be undone: reversing a whole commitment
 * on a part-delivered order would say the company never committed to goods standing in its store.
 * Closing needs to know whether anything is STILL OUTSTANDING, because an order still expecting
 * delivery, or still owing an invoice, is not complete.
 *
 * Procurement declares the question and Inventory and Finance answer it, in the same shape
 * `PoMatchPort` uses in the other direction — Finance asking Procurement what an order committed.
 * Neither module imports the other; the app layer is where a cross-context read is composed.
 *
 * NULL IS NOT ZERO HERE, and that is why the port returns a discriminated answer rather than two
 * numbers. A position that could not be read must not arrive as "nothing has happened", which would
 * make every order look freely cancellable at exactly the moment the system cannot see.
 */
export type OrderPositionAnswer =
  | {
      known: true;
      /** Ex-tax value of ACCEPTED receipts against this order. */
      receivedValue: number;
      /** Ex-tax value of invoices against this order that are not cancelled. */
      invoicedValue: number;
      /** Accepted and rejected quantity per order line, for the outstanding test. */
      acceptedByLine: Record<string, number>;
      rejectedByLine: Record<string, number>;
    }
  | { known: false; reason: string };

export interface PoPositionPort {
  /**
   * `poLineIds` is passed IN rather than looked up, and that is not a convenience: the adapter would
   * otherwise need Procurement's own line service, and a wiring module that both imports
   * ProcurementModule and provides a port ProcurementModule consumes is a loop Nest resolves by
   * hanging in `NestFactory.create` with nothing to read. The caller has its lines already.
   */
  positionOf(tenantId: Id, poId: Id, poLineIds: Id[]): Promise<OrderPositionAnswer>;
}
