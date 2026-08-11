import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import { type Page, type PageParams } from '@aura/shared';
import type { Transmittal } from './domain/transmittal';
import type { TransmittalStore, DocListFilter } from './store.interface';
import { pagePostgres, docWhere } from './paged-query';

export class PostgresTransmittalStore implements TransmittalStore {
  constructor(private readonly pool: Pool) {}

  async save(transmittal: Transmittal, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_transmittals (
        id, tenant_id, company_id, code, title, project_id, project_name, sender, recipient, status, owner_id, created_by, created_at, updated_at, sent_at, received_at, acknowledged_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      on conflict (id) do update set
        company_id = excluded.company_id,
        code = excluded.code,
        title = excluded.title,
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        sender = excluded.sender,
        recipient = excluded.recipient,
        status = excluded.status,
        owner_id = excluded.owner_id,
        updated_at = excluded.updated_at,
        sent_at = excluded.sent_at,
        received_at = excluded.received_at,
        acknowledged_at = excluded.acknowledged_at`,
      [
        transmittal.id,
        transmittal.tenantId,
        transmittal.companyId,
        transmittal.code,
        transmittal.title,
        transmittal.projectId,
        transmittal.projectName,
        transmittal.sender,
        transmittal.recipient,
        transmittal.status,
        transmittal.ownerId,
        transmittal.createdBy,
        transmittal.createdAt,
        transmittal.updatedAt,
        transmittal.sentAt,
        transmittal.receivedAt,
        transmittal.acknowledgedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<Transmittal | null> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittals where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<Transmittal[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittals where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  async findAll(tenantId: string): Promise<Transmittal[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittals where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  async listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Transmittal>> {
    const { where, params } = docWhere(filter);
    return pagePostgres(this.pool, { table: 'aura_doccontrol_transmittals', where, params, orderBy: 'created_at DESC', map: (r) => this.mapRow(r) }, page);
  }

  private mapRow(row: QueryResultRow): Transmittal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      code: row.code,
      title: row.title,
      projectId: row.project_id,
      projectName: row.project_name,
      sender: row.sender,
      recipient: row.recipient,
      status: row.status,
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      receivedAt: row.received_at ? new Date(row.received_at).toISOString() : null,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
      ownerId: row.owner_id,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
