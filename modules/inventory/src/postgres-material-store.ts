import type { Pool } from 'pg';
import type { MaterialFilter, MaterialStore } from './material-store';
import type { Material, MaterialStatus } from './domain/material';

interface Row {
  id: string; tenant_id: string; company_id: string | null; code: string; name: string;
  specification: string | null; manufacturer: string | null; model: string | null;
  uom: string; status: string; created_by: string | null; created_at: string;
}

const COLS = `id, tenant_id, company_id, code, name, specification, manufacturer, model, uom, status, created_by, created_at`;

function toMaterial(r: Row): Material {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, code: r.code, name: r.name,
    specification: r.specification, manufacturer: r.manufacturer, model: r.model,
    uom: r.uom, status: r.status as MaterialStatus, createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
  };
}

export class PostgresMaterialStore implements MaterialStore {
  constructor(private readonly pool: Pool) {}

  /**
   * `code` and `uom` are written on insert and deliberately NOT in the update set: the domain
   * refuses to change either, and the statement says the same thing so a future caller reaching
   * past the domain cannot quietly rewrite an identity or reinterpret every quantity of it.
   */
  async save(m: Material): Promise<void> {
    await this.pool.query(
      `insert into public.aura_inventory_materials (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set
         name = excluded.name,
         specification = excluded.specification,
         manufacturer = excluded.manufacturer,
         model = excluded.model,
         status = excluded.status`,
      [m.id, m.tenantId, m.companyId, m.code, m.name, m.specification, m.manufacturer, m.model,
       m.uom, m.status, m.createdBy, m.createdAt],
    );
  }

  async find(id: string, tenantId: string): Promise<Material | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_materials where id = $1 and tenant_id = $2`, [id, tenantId],
    );
    return res.rows[0] ? toMaterial(res.rows[0]) : null;
  }

  async findByCode(code: string, tenantId: string): Promise<Material | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_materials
        where tenant_id = $1 and lower(btrim(code)) = lower(btrim($2))`,
      [tenantId, code],
    );
    return res.rows[0] ? toMaterial(res.rows[0]) : null;
  }

  /** Looks the references up directly — no list, so no limit that could hide a real material. */
  async resolveMany(references: string[], tenantId: string): Promise<Material[]> {
    const needles = [...new Set(references.map((r) => r.trim().toLowerCase()).filter(Boolean))];
    if (needles.length === 0) return [];
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_materials
        where tenant_id = $1 and (lower(id::text) = any($2) or lower(btrim(code)) = any($2))`,
      [tenantId, needles],
    );
    return res.rows.map(toMaterial);
  }

  async list(tenantId: string, filter?: MaterialFilter): Promise<Material[]> {
    const clauses = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (filter?.status) { params.push(filter.status); clauses.push(`status = $${params.length}`); }
    if (filter?.search?.trim()) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      clauses.push(`(lower(code) like $${params.length} or lower(name) like $${params.length})`);
    }
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_materials
        where ${clauses.join(' and ')} order by code limit 1000`,
      params,
    );
    return res.rows.map(toMaterial);
  }
}
