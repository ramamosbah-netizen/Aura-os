import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Correspondence } from './domain/correspondence';
import type { CorrespondenceStore } from './store.interface';

export class PostgresCorrespondenceStore implements CorrespondenceStore {
  constructor(private readonly pool: Pool) {}

  async save(correspondence: Correspondence, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_correspondence (
        id, tenant_id, company_id, code, subject, project_id, project_name, direction, sender, recipient, status, owner_id, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        company_id = excluded.company_id,
        code = excluded.code,
        subject = excluded.subject,
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        direction = excluded.direction,
        sender = excluded.sender,
        recipient = excluded.recipient,
        status = excluded.status,
        owner_id = excluded.owner_id,
        updated_at = excluded.updated_at`,
      [
        correspondence.id,
        correspondence.tenantId,
        correspondence.companyId,
        correspondence.code,
        correspondence.subject,
        correspondence.projectId,
        correspondence.projectName,
        correspondence.direction,
        correspondence.sender,
        correspondence.recipient,
        correspondence.status,
        correspondence.ownerId,
        correspondence.createdBy,
        correspondence.createdAt,
        correspondence.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<Correspondence | null> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_correspondence where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Correspondence[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_correspondence where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  async findAll(tenantId: string): Promise<Correspondence[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_correspondence where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: QueryResultRow): Correspondence {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      code: row.code,
      subject: row.subject,
      projectId: row.project_id,
      projectName: row.project_name,
      direction: row.direction,
      sender: row.sender,
      recipient: row.recipient,
      status: row.status,
      ownerId: row.owner_id,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
