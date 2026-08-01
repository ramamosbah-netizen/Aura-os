import type { Pool } from 'pg';
import type { StorageLocationStore } from './storage-location-store';
import type { StorageLocation, LocationType } from './domain/storage-location';

interface Row {
  id: string; tenant_id: string; company_id: string | null; warehouse: string; bin_code: string;
  description: string | null; type: string; active: boolean; created_by: string | null;
  created_at: string; updated_at: string;
}

const COLS = `id, tenant_id, company_id, warehouse, bin_code, description, type, active, created_by, created_at, updated_at`;

function toLoc(r: Row): StorageLocation {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, warehouse: r.warehouse,
    binCode: r.bin_code, description: r.description, type: r.type as LocationType, active: r.active,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export class PostgresStorageLocationStore implements StorageLocationStore {
  constructor(private readonly pool: Pool) {}

  async save(l: StorageLocation): Promise<void> {
    await this.pool.query(
      `insert into public.aura_inventory_locations (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set
         description = excluded.description, type = excluded.type, active = excluded.active, updated_at = excluded.updated_at`,
      [l.id, l.tenantId, l.companyId, l.warehouse, l.binCode, l.description, l.type, l.active, l.createdBy, l.createdAt, l.updatedAt],
    );
  }

  async find(id: string, tenantId: string): Promise<StorageLocation | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_locations where id = $1 and tenant_id = $2`, [id, tenantId],
    );
    return res.rows[0] ? toLoc(res.rows[0]) : null;
  }

  async list(tenantId: string, filter?: { warehouse?: string; active?: boolean }): Promise<StorageLocation[]> {
    const clauses = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (filter?.warehouse) { params.push(filter.warehouse); clauses.push(`warehouse = $${params.length}`); }
    if (filter?.active !== undefined) { params.push(filter.active); clauses.push(`active = $${params.length}`); }
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_locations where ${clauses.join(' and ')} order by warehouse, bin_code limit 1000`,
      params,
    );
    return res.rows.map(toLoc);
  }
}
