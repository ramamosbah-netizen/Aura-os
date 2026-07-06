import { Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import type { PoMatchPort, PoMatchSnapshot } from '@aura/finance';
import { PurchaseOrderService } from '@aura/procurement';
import { GoodsReceiptService, type GoodsReceipt } from '@aura/inventory';

/**
 * App-layer adapter for Finance's PO_MATCH_PORT (ADR-0004): the composition root is where a
 * bounded context is allowed to read another's data. Fetches PO value + received-GRN value from
 * Procurement + Inventory; the match *rule* stays in Finance. This decouples finance at compile
 * time (no @aura/procurement / @aura/inventory import in the module) while preserving the exact
 * synchronous behaviour of the previous in-module 3-way match.
 */
@Injectable()
export class PoMatchAdapter implements PoMatchPort {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly goodsReceipts: GoodsReceiptService,
  ) {}

  async getSnapshot(_tenantId: Id, poId: Id): Promise<PoMatchSnapshot> {
    const po = await this.purchaseOrders.get(poId);
    if (!po) return { poExists: false, poValue: 0, receivedValue: 0 };
    const grns = await this.goodsReceipts.list({ poId });
    const receivedValue = grns
      .filter((g: GoodsReceipt) => g.status === 'received')
      .reduce((sum: number, g: GoodsReceipt) => sum + g.value, 0);
    return { poExists: true, poValue: po.value, receivedValue };
  }
}
