import type { Pool } from 'pg';
import type { GoodsReceiptLineStore } from './goods-receipt-line-store';
import type { GoodsReceiptLine } from './domain/goods-receipt-line';

interface Row {
  id: string; tenant_id: string; company_id: string | null; grn_id: string; line_no: number;
  po_line_id: string; quantity_accepted: string; quantity_rejected: string;
  rejection_reason: string | null; notes: string | null;
  created_by: string | null; created_at: string;
}

const COLS = `id, tenant_id, company_id, grn_id, line_no, po_line_id, quantity_accepted,
  quantity_rejected, rejection_reason, notes, created_by, created_at`;

function toLine(r: Row): GoodsReceiptLine {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, grnId: r.grn_id,
    lineNo: Number(r.line_no), poLineId: r.po_line_id,
    quantityAccepted: Number(r.quantity_accepted), quantityRejected: Number(r.quantity_rejected),
    rejectionReason: r.rejection_reason, notes: r.notes, createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
  };
}

export class PostgresGoodsReceiptLineStore implements GoodsReceiptLineStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Insert only — a receipt line is a record of what arrived on a day, and correcting it by
   * overwriting would erase the delivery it documents. A wrong receipt is answered by another
   * receipt, which is how goods-received notes work on paper too.
   */
  async save(l: GoodsReceiptLine): Promise<void> {
    await this.pool.query(
      `insert into public.aura_inventory_goods_receipt_lines (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do nothing`,
      [l.id, l.tenantId, l.companyId, l.grnId, l.lineNo, l.poLineId, l.quantityAccepted,
       l.quantityRejected, l.rejectionReason, l.notes, l.createdBy, l.createdAt],
    );
  }

  async listForReceipt(grnId: string, tenantId: string): Promise<GoodsReceiptLine[]> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_goods_receipt_lines
        where grn_id = $1 and tenant_id = $2 order by line_no`,
      [grnId, tenantId],
    );
    return res.rows.map(toLine);
  }

  /** Looks the order lines up directly — no list, so no limit that could hide a real receipt. */
  async listForOrderLines(poLineIds: string[], tenantId: string): Promise<GoodsReceiptLine[]> {
    const ids = [...new Set(poLineIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_goods_receipt_lines
        where tenant_id = $1 and po_line_id = any($2::uuid[])`,
      [tenantId, ids],
    );
    return res.rows.map(toLine);
  }
}
