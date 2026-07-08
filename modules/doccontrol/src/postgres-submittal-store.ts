import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import { type Page, type PageParams } from '@aura/shared';
import type { Submittal } from './domain/submittal';
import type { SubmittalStore, DocListFilter } from './store.interface';
import { pagePostgres, docWhere } from './paged-query';

export class PostgresSubmittalStore implements SubmittalStore {
  constructor(private readonly pool: Pool) {}

  async save(s: Submittal, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_submittals (
        id, tenant_id, company_id, project_id, project_name, reference, title, discipline, revision, status, review_code, review_comments, submitted_at, returned_at, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do update set
        status = excluded.status,
        review_code = excluded.review_code,
        review_comments = excluded.review_comments,
        submitted_at = excluded.submitted_at,
        returned_at = excluded.returned_at,
        updated_at = excluded.updated_at`,
      [s.id, s.tenantId, s.companyId, s.projectId, s.projectName, s.reference, s.title, s.discipline, s.revision, s.status, s.reviewCode, s.reviewComments, s.submittedAt, s.returnedAt, s.createdBy, s.createdAt, s.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<Submittal | null> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_submittals where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapRow(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Submittal[]> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_submittals where project_id = $1 and tenant_id = $2 order by created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapRow);
  }

  async findAll(tenantId: string): Promise<Submittal[]> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_submittals where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapRow);
  }

  async listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Submittal>> {
    const { where, params } = docWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_doccontrol_submittals', where, params, orderBy: 'created_at DESC', map: (r) => this.mapRow(r) }, page);
  }

  private mapRow(row: QueryResultRow): Submittal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      reference: row.reference,
      title: row.title,
      discipline: row.discipline,
      revision: Number(row.revision),
      status: row.status,
      reviewCode: row.review_code,
      reviewComments: row.review_comments || '',
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
      returnedAt: row.returned_at ? row.returned_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
