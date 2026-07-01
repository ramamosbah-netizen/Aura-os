import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { DrawingRegisterEntry } from './domain/drawing-register';
import type { DrawingRegisterStore } from './store.interface';

export class PostgresDrawingRegisterStore implements DrawingRegisterStore {
  constructor(private readonly pool: Pool) {}

  async save(e: DrawingRegisterEntry, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_drawing_register (
        id, tenant_id, company_id, project_id, project_name, document_number, title, discipline, doc_type,
        current_revision, status, custodian, distribution, revision_date, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do update set
        title = excluded.title, discipline = excluded.discipline, doc_type = excluded.doc_type,
        current_revision = excluded.current_revision, status = excluded.status, custodian = excluded.custodian,
        distribution = excluded.distribution, revision_date = excluded.revision_date, updated_at = excluded.updated_at`,
      [e.id, e.tenantId, e.companyId, e.projectId, e.projectName, e.documentNumber, e.title, e.discipline, e.docType,
       e.currentRevision, e.status, e.custodian, JSON.stringify(e.distribution), e.revisionDate, e.createdBy, e.createdAt, e.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<DrawingRegisterEntry | null> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_drawing_register where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapRow(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<DrawingRegisterEntry[]> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_drawing_register where project_id = $1 and tenant_id = $2 order by document_number asc`, [projectId, tenantId]);
    return res.rows.map(this.mapRow);
  }

  async findAll(tenantId: string): Promise<DrawingRegisterEntry[]> {
    const res = await this.pool.query(`select * from public.aura_doccontrol_drawing_register where tenant_id = $1 order by document_number asc`, [tenantId]);
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: any): DrawingRegisterEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      documentNumber: row.document_number,
      title: row.title,
      discipline: row.discipline,
      docType: row.doc_type,
      currentRevision: row.current_revision,
      status: row.status,
      custodian: row.custodian,
      distribution: typeof row.distribution === 'string' ? JSON.parse(row.distribution) : (row.distribution ?? []),
      revisionDate: row.revision_date instanceof Date ? row.revision_date.toISOString().split('T')[0] : (row.revision_date ? String(row.revision_date) : null),
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
