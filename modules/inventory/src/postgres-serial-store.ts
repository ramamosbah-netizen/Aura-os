import type { Pool } from 'pg';
import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { SerialStore } from './serial-store';
import type { SerialUnit, SerialStatus } from './domain/serial-unit';

interface Row {
  id: string; tenant_id: string; company_id: string | null; serial_number: string;
  item_code: string; item_name: string; warehouse: string | null; grn_id: string | null;
  status: string; project_id: string | null; project_name: string | null; location: string | null;
  installed_at: string | null; warranty_start_date: string | null; warranty_months: number | null;
  notes: string | null; created_by: string | null; created_at: string; updated_at: string;
}

const COLS = `id, tenant_id, company_id, serial_number, item_code, item_name, warehouse, grn_id,
  status, project_id, project_name, location, installed_at, warranty_start_date::text,
  warranty_months, notes, created_by, created_at, updated_at`;
const INSERT_COLS = `id, tenant_id, company_id, serial_number, item_code, item_name, warehouse, grn_id,
  status, project_id, project_name, location, installed_at, warranty_start_date,
  warranty_months, notes, created_by, created_at, updated_at`;

function toUnit(r: Row): SerialUnit {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, serialNumber: r.serial_number,
    itemCode: r.item_code, itemName: r.item_name, warehouse: r.warehouse, grnId: r.grn_id,
    status: r.status as SerialStatus, projectId: r.project_id, projectName: r.project_name,
    location: r.location, installedAt: r.installed_at, warrantyStartDate: r.warranty_start_date,
    warrantyMonths: r.warranty_months == null ? null : Number(r.warranty_months), notes: r.notes,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export class PostgresSerialStore implements SerialStore {
  constructor(private readonly pool: Pool) {}

  async save(u: SerialUnit): Promise<void> {
    await this.pool.query(
      `insert into public.aura_inventory_serials (${INSERT_COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (id) do update set
         warehouse = excluded.warehouse, status = excluded.status, project_id = excluded.project_id,
         project_name = excluded.project_name, location = excluded.location,
         installed_at = excluded.installed_at, warranty_start_date = excluded.warranty_start_date,
         warranty_months = excluded.warranty_months, notes = excluded.notes, updated_at = excluded.updated_at`,
      [
        u.id, u.tenantId, u.companyId, u.serialNumber, u.itemCode, u.itemName, u.warehouse, u.grnId,
        u.status, u.projectId, u.projectName, u.location, u.installedAt, u.warrantyStartDate,
        u.warrantyMonths, u.notes, u.createdBy, u.createdAt, u.updatedAt,
      ],
    );
  }

  async find(id: string, tenantId: string): Promise<SerialUnit | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_serials where id = $1 and tenant_id = $2`, [id, tenantId],
    );
    return res.rows[0] ? toUnit(res.rows[0]) : null;
  }

  async list(tenantId: string, filter?: { status?: string; projectId?: string; itemCode?: string }): Promise<SerialUnit[]> {
    const clauses = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (filter?.status) { params.push(filter.status); clauses.push(`status = $${params.length}`); }
    if (filter?.projectId) { params.push(filter.projectId); clauses.push(`project_id = $${params.length}`); }
    if (filter?.itemCode) { params.push(filter.itemCode); clauses.push(`item_code = $${params.length}`); }
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_inventory_serials where ${clauses.join(' and ')} order by created_at desc limit 1000`,
      params,
    );
    return res.rows.map(toUnit);
  }

  async listPaged(tenantId: string, page: PageParams, filter?: { status?: string; projectId?: string }): Promise<Page<SerialUnit>> {
    const all = await this.list(tenantId, filter);
    return makePage(all.slice(page.offset, page.offset + page.limit), all.length, page);
  }
}
