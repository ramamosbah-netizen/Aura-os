import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { BimModel } from './domain/bim-model';
import type { BimModelFilter, BimModelStore } from './bim-model-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  code: string;
  name: string;
  discipline: string;
  format: string;
  storage_key: string | null;
  file_url: string | null;
  version: number;
  revision: string;
  status: string;
  file_size_bytes: string | number | null;
  federation_group: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, project_id, project_name, code, name, discipline, format, storage_key, file_url, version, revision, status, file_size_bytes, federation_group, notes, uploaded_by, created_at, updated_at';

function rowToModel(r: Row): BimModel {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    code: r.code,
    name: r.name,
    discipline: r.discipline as BimModel['discipline'],
    format: r.format as BimModel['format'],
    storageKey: r.storage_key,
    fileUrl: r.file_url,
    version: Number(r.version),
    revision: r.revision,
    status: r.status as BimModel['status'],
    fileSizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
    federationGroup: r.federation_group,
    notes: r.notes,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresBimModelStore implements BimModelStore {
  constructor(private readonly pool: Pool) {}

  async save(m: BimModel): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_engineering_bim_models (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, discipline = EXCLUDED.discipline, format = EXCLUDED.format,
         storage_key = EXCLUDED.storage_key, file_url = EXCLUDED.file_url, version = EXCLUDED.version,
         revision = EXCLUDED.revision, status = EXCLUDED.status, file_size_bytes = EXCLUDED.file_size_bytes,
         federation_group = EXCLUDED.federation_group, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
      [m.id, m.tenantId, m.companyId, m.projectId, m.projectName, m.code, m.name, m.discipline, m.format, m.storageKey, m.fileUrl, m.version, m.revision, m.status, m.fileSizeBytes, m.federationGroup, m.notes, m.uploadedBy, m.createdAt, m.updatedAt],
    );
  }

  async get(id: Id): Promise<BimModel | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_engineering_bim_models WHERE id = $1`, [id]);
    return res.rows.length ? rowToModel(res.rows[0]) : null;
  }

  private buildWhere(filter: BimModelFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('discipline', filter.discipline);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: BimModelFilter = {}): Promise<BimModel[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_bim_models ${whereSql} ORDER BY code ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToModel);
  }

  async listPaged(filter: BimModelFilter, page: PageParams): Promise<Page<BimModel>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_bim_models ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_bim_models ${whereSql} ORDER BY code ASC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToModel), total, page);
  }
}
