import type { Pool } from 'pg';
import type { PurchaseRequestLineStore } from './purchase-request-line-store';
import type { PurchaseRequestLine } from './domain/purchase-request-line';

interface Row {
  id: string; tenant_id: string; company_id: string | null; pr_id: string; line_no: number;
  material_id: string; material_code: string; material_name: string; specification: string | null;
  manufacturer: string | null; model: string | null; uom: string; quantity: string;
  need_by_date: string | null; estimated_unit_cost: string | null;
  wbs_node_id: string | null; cbs_node_id: string | null; notes: string | null;
  created_by: string | null; created_at: string;
}

const COLS = `id, tenant_id, company_id, pr_id, line_no, material_id, material_code, material_name,
  specification, manufacturer, model, uom, quantity, need_by_date, estimated_unit_cost,
  wbs_node_id, cbs_node_id, notes, created_by, created_at`;

const dateOnly = (v: string | Date | null): string | null =>
  v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

function toLine(r: Row): PurchaseRequestLine {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, prId: r.pr_id, lineNo: Number(r.line_no),
    materialId: r.material_id, materialCode: r.material_code, materialName: r.material_name,
    specification: r.specification, manufacturer: r.manufacturer, model: r.model, uom: r.uom,
    quantity: Number(r.quantity),
    needByDate: dateOnly(r.need_by_date as string | null),
    // NULL stays null rather than becoming 0 — an unpriced line is unpriced, not free.
    estimatedUnitCost: r.estimated_unit_cost === null ? null : Number(r.estimated_unit_cost),
    wbsNodeId: r.wbs_node_id, cbsNodeId: r.cbs_node_id, notes: r.notes,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
  };
}

export class PostgresPurchaseRequestLineStore implements PurchaseRequestLineStore {
  constructor(private readonly pool: Pool) {}

  /**
   * `material_id` and the snapshot columns are written on insert and NOT in the update set. The
   * snapshot records what the material was when the line was authored; re-pointing a line at a
   * different material, or refreshing its description from the catalogue, would erase exactly the
   * thing it exists to preserve. A line that should name something else is removed and re-added.
   */
  async save(l: PurchaseRequestLine): Promise<void> {
    await this.pool.query(
      `insert into public.aura_procurement_purchase_request_lines (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (id) do update set
         line_no = excluded.line_no,
         quantity = excluded.quantity,
         need_by_date = excluded.need_by_date,
         estimated_unit_cost = excluded.estimated_unit_cost,
         wbs_node_id = excluded.wbs_node_id,
         cbs_node_id = excluded.cbs_node_id,
         notes = excluded.notes`,
      [l.id, l.tenantId, l.companyId, l.prId, l.lineNo, l.materialId, l.materialCode, l.materialName,
       l.specification, l.manufacturer, l.model, l.uom, l.quantity, l.needByDate, l.estimatedUnitCost,
       l.wbsNodeId, l.cbsNodeId, l.notes, l.createdBy, l.createdAt],
    );
  }

  async find(id: string, tenantId: string): Promise<PurchaseRequestLine | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_procurement_purchase_request_lines where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toLine(res.rows[0]) : null;
  }

  async listForRequest(prId: string, tenantId: string): Promise<PurchaseRequestLine[]> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_procurement_purchase_request_lines
        where pr_id = $1 and tenant_id = $2 order by line_no`,
      [prId, tenantId],
    );
    return res.rows.map(toLine);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `delete from public.aura_procurement_purchase_request_lines where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
  }
}
