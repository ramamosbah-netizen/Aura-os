import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Id } from '@aura/shared';
import type { OrderPositionAnswer, PoPositionPort } from '@aura/procurement';
import { GoodsReceiptService, type GoodsReceipt } from '@aura/inventory';
import { InvoiceService } from '@aura/finance';

/**
 * App-layer adapter for Procurement's PO_POSITION_PORT (ADR-0004, J3-01).
 *
 * Cancelling and closing a purchase order both turn on what has already happened against it, and
 * that answer lives in two other modules: Inventory owns receipts, Finance owns invoices. The
 * composition root is where a cross-context read is allowed, which is the same place `PoMatchAdapter`
 * composes the mirror-image question — Finance asking Procurement what an order committed.
 *
 * A FAILURE HERE IS REPORTED, NEVER FLATTENED TO ZERO. "Nothing has been received" and "I could not
 * find out what has been received" are the same number and opposite facts, and the second one makes
 * every order look freely cancellable at exactly the moment the system cannot see. The port returns
 * a discriminated answer so the domain refuses instead.
 */
@Injectable()
export class PoPositionAdapter implements PoPositionPort {
  /**
   * THE INVOICE SERVICE IS RESOLVED LAZILY, and the reason is a loop that does not announce itself.
   *
   * Importing `FinanceModule` here closes this circle:
   *
   *   ProcurementWiring → Finance → (needs PO_MATCH_PORT) FinanceWiring → Procurement →
   *   (needs PO_POSITION_PORT) ProcurementWiring
   *
   * Nest resolves that by HANGING in `NestFactory.create` — every e2e suite timing out in a
   * `beforeAll` with no error to read, which is a worse failure than a crash because it looks like
   * slowness. `ModuleRef` with `strict: false` reaches the already-constructed service at call time
   * instead, so the module graph stays a tree.
   */
  constructor(
    private readonly goodsReceipts: GoodsReceiptService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private invoiceService(): InvoiceService | null {
    try {
      return this.moduleRef.get(InvoiceService, { strict: false });
    } catch {
      return null;
    }
  }

  async positionOf(tenantId: Id, poId: Id, poLineIds: Id[]): Promise<OrderPositionAnswer> {
    try {
      const invoiceService = this.invoiceService();
      if (!invoiceService) {
        // Reported, never flattened: "no invoices" and "I could not ask about invoices" are the same
        // number and opposite facts, and the second must not make an order look freely cancellable.
        return { known: false, reason: 'the invoice register could not be reached' };
      }
      const [grns, invoices] = await Promise.all([
        this.goodsReceipts.list({ poId }),
        invoiceService.list({ poId }),
      ]);

      const receivedValue = grns
        .filter((g: GoodsReceipt) => g.status === 'received')
        .reduce((sum: number, g: GoodsReceipt) => sum + (g.value || 0), 0);

      // A cancelled invoice is not a claim on this order any more; everything else is, including
      // one still in draft, because an unposted invoice is money somebody intends to charge.
      const invoicedValue = invoices
        .filter((i) => i.status !== 'cancelled')
        .reduce((sum: number, i) => sum + (i.value || 0), 0);

      const { accepted, rejected } = await this.goodsReceipts.receiptPositions(tenantId, poLineIds);
      return { known: true, receivedValue, invoicedValue, acceptedByLine: accepted, rejectedByLine: rejected };
    } catch (error) {
      return { known: false, reason: (error as Error).message };
    }
  }
}
