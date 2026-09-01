import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { DeliveryItemMap } from './domain/delivery-item-map';
import type { DeliveryItemMapFilter, DeliveryItemMapStore } from './delivery-item-map-store';

interface Row {
  id: string;
  tenant_id: string;
  project_id: string;
  handover_id: string;
  frozen_item_key: string;
  source_kind: string;
  source_id: string | null;
  source_revision_ref: string | null;
  source_item_id: string | null;
  wbs_node_id: string | null;
  cbs_node_id: string | null;
  created_at: Date | string;
  immutable_at: Date | string;
}

const COLS = 'id, tenant_id, project_id, handover_id, frozen_item_key, source_kind, source_id, source_revision_ref, source_item_id, wbs_node_id, cbs_node_id, created_at, immutable_at';

function rowToMap(row: Row): DeliveryItemMap {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    handoverId: row.handover_id,
    frozenItemKey: row.frozen_item_key,
    sourceKind: row.source_kind as DeliveryItemMap['sourceKind'],
    sourceId: row.source_id,
    sourceRevisionRef: row.source_revision_ref,
    sourceItemId: row.source_item_id,
    wbsNodeId: row.wbs_node_id,
    cbsNodeId: row.cbs_node_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    immutableAt: row.immutable_at instanceof Date ? row.immutable_at.toISOString() : String(row.immutable_at),
  };
}

export class PostgresDeliveryItemMapStore implements DeliveryItemMapStore {
  constructor(private readonly pool: Pool) {}

  async create(map: DeliveryItemMap): Promise<DeliveryItemMap> {
    const result = await this.pool.query<Row>(
      `INSERT INTO public.aura_projects_delivery_item_maps
        (id, tenant_id, project_id, handover_id, frozen_item_key, source_kind, source_id, source_revision_ref, source_item_id, wbs_node_id, cbs_node_id, created_at, immutable_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (tenant_id, project_id, frozen_item_key) DO NOTHING
       RETURNING ${COLS}`,
      [map.id, map.tenantId, map.projectId, map.handoverId, map.frozenItemKey, map.sourceKind, map.sourceId, map.sourceRevisionRef, map.sourceItemId, map.wbsNodeId, map.cbsNodeId, map.createdAt, map.immutableAt],
    );
    if (result.rows[0]) return rowToMap(result.rows[0]);
    const existing = await this.getByIdentity(map.tenantId, map.projectId, map.frozenItemKey);
    if (!existing) throw new Error('delivery item mapping insert was not observable after conflict');
    return existing;
  }

  async get(id: Id): Promise<DeliveryItemMap | null> {
    const result = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_delivery_item_maps WHERE id = $1`, [id]);
    return result.rows[0] ? rowToMap(result.rows[0]) : null;
  }

  async getByIdentity(tenantId: Id, projectId: Id, frozenItemKey: string): Promise<DeliveryItemMap | null> {
    const result = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_delivery_item_maps WHERE tenant_id = $1 AND project_id = $2 AND frozen_item_key = $3`,
      [tenantId, projectId, frozenItemKey],
    );
    return result.rows[0] ? rowToMap(result.rows[0]) : null;
  }

  async list(filter: DeliveryItemMapFilter = {}): Promise<DeliveryItemMap[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: string | undefined): void => {
      if (value !== undefined) { params.push(value); where.push(`${column} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('handover_id', filter.handoverId);
    add('frozen_item_key', filter.frozenItemKey);
    const result = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_delivery_item_maps ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC`,
      params,
    );
    return result.rows.map(rowToMap);
  }
}
