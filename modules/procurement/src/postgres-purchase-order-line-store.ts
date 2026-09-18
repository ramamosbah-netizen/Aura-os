import type { Pool } from 'pg';
import type { PurchaseOrderLineStore } from './purchase-order-line-store';
import type { PurchaseOrderLine, PurchaseOrderLineSource, UnitPriceBasis } from './domain/purchase-order-line';

interface Row {
  id: string; tenant_id: string; company_id: string | null; po_id: string; line_no: number;
  material_id: string; material_code: string; material_name: string; specification: string | null;
  manufacturer: string | null; model: string | null; uom: string;
  quantity: string; unit_price: string; unit_price_basis: string | null;
  line_discount: string | null; line_discount_basis: string | null;
  source_type: string; source_pr_line_id: string | null; source_quote_line_id: string | null;
  wbs_node_id: string | null; cbs_node_id: string | null; notes: string | null;
  created_by: string | null; created_at: string;
}

const COLS = `id, tenant_id, company_id, po_id, line_no, material_id, material_code, material_name,
  specification, manufacturer, model, uom, quantity, unit_price, unit_price_basis, line_discount,
  line_discount_basis, source_type, source_pr_line_id, source_quote_line_id, wbs_node_id, cbs_node_id,
  notes, created_by, created_at`;

function toLine(r: Row): PurchaseOrderLine {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, poId: r.po_id, lineNo: Number(r.line_no),
    materialId: r.material_id, materialCode: r.material_code, materialName: r.material_name,
    specification: r.specification, manufacturer: r.manufacturer, model: r.model, uom: r.uom,
    quantity: Number(r.quantity), unitPrice: Number(r.unit_price),
    unitPriceBasis: (r.unit_price_basis as UnitPriceBasis | null) ?? null,
    // NULL is no discount. Read as well as written: a column the store never selects is a
    // commercial term the domain carried and the database quietly dropped (PO-01).
    lineDiscount: r.line_discount === null ? null : Number(r.line_discount),
    lineDiscountBasis: (r.line_discount_basis as PurchaseOrderLine['lineDiscountBasis']) ?? null,
    sourceType: r.source_type as PurchaseOrderLineSource,
    sourcePrLineId: r.source_pr_line_id, sourceQuoteLineId: r.source_quote_line_id,
    wbsNodeId: r.wbs_node_id, cbsNodeId: r.cbs_node_id, notes: r.notes,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
  };
}

export class PostgresPurchaseOrderLineStore implements PurchaseOrderLineStore {
  constructor(private readonly pool: Pool) {}

  /**
   * The material identity, its snapshot AND the lineage are written on insert and are NOT in the
   * update set. The snapshot records what the material was when the line was authored, and the
   * lineage records how the line came to be bought — re-pointing either after the fact would erase
   * exactly what they exist to preserve. A line that should say something else is removed and
   * re-added, which is only possible while the order is a draft anyway.
   */
  async save(l: PurchaseOrderLine): Promise<void> {
    await this.pool.query(
      `insert into public.aura_procurement_purchase_order_lines (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       on conflict (id) do update set
         line_no = excluded.line_no,
         quantity = excluded.quantity,
         unit_price = excluded.unit_price,
         unit_price_basis = excluded.unit_price_basis,
         line_discount = excluded.line_discount,
         line_discount_basis = excluded.line_discount_basis,
         wbs_node_id = excluded.wbs_node_id,
         cbs_node_id = excluded.cbs_node_id,
         notes = excluded.notes`,
      [l.id, l.tenantId, l.companyId, l.poId, l.lineNo, l.materialId, l.materialCode, l.materialName,
       l.specification, l.manufacturer, l.model, l.uom, l.quantity, l.unitPrice, l.unitPriceBasis, l.lineDiscount,
       l.lineDiscountBasis, l.sourceType, l.sourcePrLineId, l.sourceQuoteLineId, l.wbsNodeId, l.cbsNodeId,
       l.notes, l.createdBy, l.createdAt],
    );
  }

  async find(id: string, tenantId: string): Promise<PurchaseOrderLine | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_procurement_purchase_order_lines where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toLine(res.rows[0]) : null;
  }

  async listForOrder(poId: string, tenantId: string): Promise<PurchaseOrderLine[]> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_procurement_purchase_order_lines
        where po_id = $1 and tenant_id = $2 order by line_no`,
      [poId, tenantId],
    );
    return res.rows.map(toLine);
  }

  /** Looks the references up directly — no list, so no limit that could hide a real order line. */
  async listForRequestLines(prLineIds: string[], tenantId: string): Promise<PurchaseOrderLine[]> {
    const ids = [...new Set(prLineIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_procurement_purchase_order_lines
        where tenant_id = $1 and source_pr_line_id = any($2::uuid[])`,
      [tenantId, ids],
    );
    return res.rows.map(toLine);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `delete from public.aura_procurement_purchase_order_lines where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
  }
}
