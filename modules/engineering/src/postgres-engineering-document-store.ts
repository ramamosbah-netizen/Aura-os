import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { EngineeringDocument } from './domain/engineering-document';
import type { EngineeringDocumentFilter, EngineeringDocumentStore } from './engineering-document-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  doc_type: string;
  owner_module: string;
  discipline: string;
  status: string;
  revision: string;
  fields: Record<string, unknown> | null;
  project_id: string;
  project_name: string | null;
  owner_id: string | null;
  created_by: string | null;
  decided_by: string | null;
  decided_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, doc_type, owner_module, discipline, status, revision, fields, project_id, project_name, owner_id, created_by, decided_by, decided_at, created_at, updated_at';

function rowToDoc(r: Row): EngineeringDocument {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    docType: r.doc_type as EngineeringDocument['docType'],
    ownerModule: r.owner_module as EngineeringDocument['ownerModule'],
    discipline: r.discipline as EngineeringDocument['discipline'],
    status: r.status as EngineeringDocument['status'],
    revision: r.revision,
    fields: r.fields ?? {},
    projectId: r.project_id,
    projectName: r.project_name,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at instanceof Date ? r.decided_at.toISOString() : (r.decided_at ? String(r.decided_at) : null),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresEngineeringDocumentStore implements EngineeringDocumentStore {
  constructor(private readonly pool: Pool) {}

  async create(d: EngineeringDocument): Promise<void> {
    await this.insert(this.pool, d);
  }

  async createWithClient(tx: TxHandle | null, d: EngineeringDocument): Promise<void> {
    if (tx === null) return this.create(d);
    await this.insert(tx as PoolClient, d);
  }

  private insert(executor: Pool | PoolClient, d: EngineeringDocument): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_documents (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [d.id, d.tenantId, d.companyId, d.code, d.title, d.docType, d.ownerModule, d.discipline, d.status, d.revision,
       JSON.stringify(d.fields ?? {}), d.projectId, d.projectName, d.ownerId, d.createdBy, d.decidedBy, d.decidedAt, d.createdAt, d.updatedAt],
    );
  }

  async update(d: EngineeringDocument): Promise<void> {
    await this.modify(this.pool, d);
  }

  async updateWithClient(tx: TxHandle | null, d: EngineeringDocument): Promise<void> {
    if (tx === null) return this.update(d);
    await this.modify(tx as PoolClient, d);
  }

  private modify(executor: Pool | PoolClient, d: EngineeringDocument): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_documents
       SET title=$2, discipline=$3, status=$4, revision=$5, fields=$6, decided_by=$7, decided_at=$8, updated_at=now()
       WHERE id=$1`,
      [d.id, d.title, d.discipline, d.status, d.revision, JSON.stringify(d.fields ?? {}), d.decidedBy, d.decidedAt],
    );
  }

  async get(id: Id): Promise<EngineeringDocument | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_engineering_documents WHERE id = $1`, [id]);
    return res.rows.length ? rowToDoc(res.rows[0]) : null;
  }

  private buildWhere(filter: EngineeringDocumentFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('doc_type', filter.docType);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: EngineeringDocumentFilter = {}): Promise<EngineeringDocument[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_documents ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToDoc);
  }

  async listPaged(filter: EngineeringDocumentFilter, page: PageParams): Promise<Page<EngineeringDocument>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_documents ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_documents ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToDoc), total, page);
  }
}
