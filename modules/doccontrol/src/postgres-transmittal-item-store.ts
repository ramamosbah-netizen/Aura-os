import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { TransmittalItem } from './domain/transmittal-item';
import type { TransmittalItemStore } from './store.interface';

export class PostgresTransmittalItemStore implements TransmittalItemStore {
  constructor(private readonly pool: Pool) {}

  async save(item: TransmittalItem, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_transmittal_items (
        id, tenant_id, company_id, transmittal_id, register_entry_id, document_number, title, revision, purpose, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (id) do update set
        revision = excluded.revision,
        purpose = excluded.purpose`,
      [item.id, item.tenantId, item.companyId, item.transmittalId, item.registerEntryId, item.documentNumber, item.title, item.revision, item.purpose, item.createdAt],
    );
  }

  async findByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalItem[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittal_items where transmittal_id = $1 and tenant_id = $2 order by document_number asc`,
      [transmittalId, tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  async findByRegisterEntry(registerEntryId: string, tenantId: string): Promise<TransmittalItem[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittal_items where register_entry_id = $1 and tenant_id = $2 order by created_at desc`,
      [registerEntryId, tenantId],
    );
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: QueryResultRow): TransmittalItem {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      transmittalId: row.transmittal_id,
      registerEntryId: row.register_entry_id,
      documentNumber: row.document_number,
      title: row.title,
      revision: row.revision,
      purpose: row.purpose,
      createdAt: row.created_at.toISOString(),
    };
  }
}
