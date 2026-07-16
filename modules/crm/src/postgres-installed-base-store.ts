import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { InstalledBaseItem } from './domain/installed-base';
import type { InstalledBaseStore } from './installed-base-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  account_id: string;
  system: string;
  site_name: string | null;
  provider: string;
  competitor_name: string | null;
  installed_at: Date | string | null;
  warranty_expires_at: Date | string | null;
  amc_status: string;
  amc_expires_at: Date | string | null;
  project_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, account_id, system, site_name, provider, competitor_name, installed_at, warranty_expires_at, amc_status, amc_expires_at, project_id, notes, created_by, created_at';

// pg returns `date` columns as a JS Date at LOCAL midnight — toISOString() would shift it a
// day back in any UTC+ timezone, so format the local calendar date instead.
const dateIso = (v: Date | string | null): string | null => {
  if (v === null) return null;
  if (!(v instanceof Date)) return String(v).slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
};

function rowToItem(r: Row): InstalledBaseItem {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    accountId: r.account_id,
    system: r.system as InstalledBaseItem['system'],
    siteName: r.site_name,
    provider: r.provider as InstalledBaseItem['provider'],
    competitorName: r.competitor_name,
    installedAt: dateIso(r.installed_at),
    warrantyExpiresAt: dateIso(r.warranty_expires_at),
    amcStatus: r.amc_status as InstalledBaseItem['amcStatus'],
    amcExpiresAt: dateIso(r.amc_expires_at),
    projectId: r.project_id,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable installed base on Postgres (`aura_crm_installed_base`). */
export class PostgresInstalledBaseStore implements InstalledBaseStore {
  constructor(private readonly pool: Pool) {}

  async create(i: InstalledBaseItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_installed_base (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [i.id, i.tenantId, i.companyId, i.accountId, i.system, i.siteName, i.provider, i.competitorName,
       i.installedAt, i.warrantyExpiresAt, i.amcStatus, i.amcExpiresAt, i.projectId, i.notes, i.createdBy, i.createdAt],
    );
  }

  async update(i: InstalledBaseItem): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_crm_installed_base
          SET system=$2, site_name=$3, provider=$4, competitor_name=$5, installed_at=$6,
              warranty_expires_at=$7, amc_status=$8, amc_expires_at=$9, project_id=$10, notes=$11
        WHERE id=$1`,
      [i.id, i.system, i.siteName, i.provider, i.competitorName, i.installedAt,
       i.warrantyExpiresAt, i.amcStatus, i.amcExpiresAt, i.projectId, i.notes],
    );
  }

  async get(id: Id): Promise<InstalledBaseItem | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_installed_base WHERE id = $1`, [id]);
    return res.rows.length ? rowToItem(res.rows[0]) : null;
  }

  async delete(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_crm_installed_base WHERE id = $1`, [id]);
  }

  async listFor(tenantId: Id, accountId: Id): Promise<InstalledBaseItem[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_installed_base WHERE tenant_id = $1 AND account_id = $2 ORDER BY system, created_at`,
      [tenantId, accountId],
    );
    return res.rows.map(rowToItem);
  }
}
