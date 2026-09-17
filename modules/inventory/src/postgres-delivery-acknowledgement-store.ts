import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { DeliveryAcknowledgement, DeliveryAcknowledgementStore } from './delivery-acknowledgement.store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; movement_id: string;
  wbs_node_id: string; project_id: string; acknowledged_by: string;
  acknowledged_at: Date | string; note: string | null; created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

const fromRow = (r: Row): DeliveryAcknowledgement => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id, movementId: r.movement_id,
  wbsNodeId: r.wbs_node_id, projectId: r.project_id, acknowledgedBy: r.acknowledged_by,
  acknowledgedAt: iso(r.acknowledged_at), note: r.note, createdAt: iso(r.created_at),
});

const COLS = 'id, tenant_id, company_id, movement_id, wbs_node_id, project_id, acknowledged_by, acknowledged_at, note, created_at';

export class PostgresDeliveryAcknowledgementStore implements DeliveryAcknowledgementStore {
  constructor(private readonly pool: Pool) {}

  async create(v: DeliveryAcknowledgement): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_inventory_delivery_acknowledgements (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.id, v.tenantId, v.companyId, v.movementId, v.wbsNodeId, v.projectId,
       v.acknowledgedBy, v.acknowledgedAt, v.note, v.createdAt],
    );
  }

  async getByMovement(tenantId: Id, movementId: Id): Promise<DeliveryAcknowledgement | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_inventory_delivery_acknowledgements
        WHERE tenant_id = $1 AND movement_id = $2`,
      [tenantId, movementId],
    );
    return res.rows[0] ? fromRow(res.rows[0]) : null;
  }

  async listByWorkPackage(tenantId: Id, wbsNodeId: Id): Promise<DeliveryAcknowledgement[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_inventory_delivery_acknowledgements
        WHERE tenant_id = $1 AND wbs_node_id = $2 ORDER BY acknowledged_at ASC`,
      [tenantId, wbsNodeId],
    );
    return res.rows.map(fromRow);
  }
}
