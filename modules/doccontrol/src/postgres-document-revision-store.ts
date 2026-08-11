import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { DocumentRevision } from './domain/document-revision';
import type { TransmittalAcknowledgement } from './domain/transmittal-acknowledgement';
import type { DocumentRevisionStore, TransmittalAcknowledgementStore } from './store.interface';

const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

export class PostgresDocumentRevisionStore implements DocumentRevisionStore {
  constructor(private readonly pool: Pool) {}

  async save(r: DocumentRevision, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_document_revisions (
        id, tenant_id, company_id, register_entry_id, document_number, project_id, revision, status,
        previous_revision, reason_for_revision, submitted_by, submitted_at, reviewed_by, reviewed_at,
        decided_by, decided_at, decision_comments, issued_by, issued_at, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      on conflict (id) do update set
        status = excluded.status,
        submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at,
        reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at,
        decided_by = excluded.decided_by, decided_at = excluded.decided_at,
        decision_comments = excluded.decision_comments,
        issued_by = excluded.issued_by, issued_at = excluded.issued_at,
        updated_at = excluded.updated_at`,
      [
        r.id, r.tenantId, r.companyId, r.registerEntryId, r.documentNumber, r.projectId, r.revision, r.status,
        r.previousRevision, r.reasonForRevision, r.submittedBy, r.submittedAt, r.reviewedBy, r.reviewedAt,
        r.decidedBy, r.decidedAt, r.decisionComments, r.issuedBy, r.issuedAt, r.createdBy, r.createdAt, r.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<DocumentRevision | null> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_document_revisions where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rowCount === 0 ? null : this.map(res.rows[0]);
  }

  async listByRegisterEntry(registerEntryId: string, tenantId: string): Promise<DocumentRevision[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_document_revisions
       where register_entry_id = $1 and tenant_id = $2 order by created_at desc`,
      [registerEntryId, tenantId],
    );
    return res.rows.map((row) => this.map(row));
  }

  private map(row: QueryResultRow): DocumentRevision {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      registerEntryId: row.register_entry_id,
      documentNumber: row.document_number,
      projectId: row.project_id,
      revision: row.revision,
      status: row.status,
      previousRevision: row.previous_revision,
      reasonForRevision: row.reason_for_revision,
      submittedBy: row.submitted_by,
      submittedAt: iso(row.submitted_at),
      reviewedBy: row.reviewed_by,
      reviewedAt: iso(row.reviewed_at),
      decidedBy: row.decided_by,
      decidedAt: iso(row.decided_at),
      decisionComments: row.decision_comments,
      issuedBy: row.issued_by,
      issuedAt: iso(row.issued_at),
      createdBy: row.created_by,
      createdAt: iso(row.created_at) as string,
      updatedAt: iso(row.updated_at) as string,
    };
  }
}

export class PostgresTransmittalAcknowledgementStore implements TransmittalAcknowledgementStore {
  constructor(private readonly pool: Pool) {}

  async save(a: TransmittalAcknowledgement, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_transmittal_acks (
        id, tenant_id, company_id, transmittal_id, transmittal_code, acknowledged_by, acknowledged_at, note
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [a.id, a.tenantId, a.companyId, a.transmittalId, a.transmittalCode, a.acknowledgedBy, a.acknowledgedAt, a.note],
    );
  }

  async listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalAcknowledgement[]> {
    const res = await this.pool.query(
      `select * from public.aura_doccontrol_transmittal_acks
       where transmittal_id = $1 and tenant_id = $2 order by acknowledged_at desc`,
      [transmittalId, tenantId],
    );
    return res.rows.map((row: QueryResultRow) => ({
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      transmittalId: row.transmittal_id,
      transmittalCode: row.transmittal_code,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: iso(row.acknowledged_at) as string,
      note: row.note,
    }));
  }
}
