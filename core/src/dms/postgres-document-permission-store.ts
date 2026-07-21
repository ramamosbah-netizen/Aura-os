import type { Pool } from 'pg';
import type { DocumentPermission, DocumentPermissionLevel, DocumentSubjectType, Id } from '@aura/shared';
import type { DocumentPermissionStore, SubjectRef } from './document-permission-store';

interface Row {
  id: string;
  tenant_id: string;
  document_id: string;
  subject_type: string;
  subject_id: string;
  permission: string;
  granted_by: string | null;
  granted_at: Date | string;
  expires_at: Date | string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function rowToPermission(r: Row): DocumentPermission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    documentId: r.document_id,
    subjectType: r.subject_type as DocumentSubjectType,
    subjectId: r.subject_id,
    permission: r.permission as DocumentPermissionLevel,
    grantedBy: r.granted_by,
    grantedAt: iso(r.granted_at),
    expiresAt: r.expires_at === null ? null : iso(r.expires_at),
  };
}

const COLS = 'id, tenant_id, document_id, subject_type, subject_id, permission, granted_by, granted_at, expires_at';

/**
 * Durable document sharing on Postgres (`aura_dms_document_permissions`, migration 0183).
 *
 * Every read filters `revoked_at is null`. Revocation is a soft delete so the audit question —
 * who granted access, and who took it away — survives; a hard delete answers nothing afterwards.
 */
export class PostgresDocumentPermissionStore implements DocumentPermissionStore {
  constructor(private readonly pool: Pool) {}

  async grant(p: DocumentPermission): Promise<void> {
    // ON CONFLICT DO NOTHING against the partial unique index in 0183: re-sharing the same
    // permission with the same subject is a no-op rather than a second live row.
    await this.pool.query(
      `INSERT INTO public.aura_dms_document_permissions (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [p.id, p.tenantId, p.documentId, p.subjectType, p.subjectId, p.permission, p.grantedBy, p.grantedAt, p.expiresAt],
    );
  }

  async listForDocument(documentId: Id): Promise<DocumentPermission[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_dms_document_permissions
       WHERE document_id = $1 AND revoked_at IS NULL
       ORDER BY granted_at DESC`,
      [documentId],
    );
    return res.rows.map(rowToPermission);
  }

  async listForSubjects(tenantId: Id, subjects: SubjectRef[]): Promise<DocumentPermission[]> {
    if (subjects.length === 0) return [];
    // Pair-wise match so a TEAM id can never satisfy a USER grant that happens to share the id.
    const types = subjects.map((s) => s.subjectType);
    const ids = subjects.map((s) => s.subjectId);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_dms_document_permissions
       WHERE tenant_id = $1
         AND revoked_at IS NULL
         AND (subject_type, subject_id) IN (
           SELECT * FROM unnest($2::text[], $3::text[])
         )
       ORDER BY granted_at DESC`,
      [tenantId, types, ids],
    );
    return res.rows.map(rowToPermission);
  }

  async revoke(id: Id, revokedBy: Id | null, at = new Date()): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE public.aura_dms_document_permissions
       SET revoked_at = $2, revoked_by = $3
       WHERE id = $1 AND revoked_at IS NULL`,
      [id, at.toISOString(), revokedBy],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async get(id: Id): Promise<DocumentPermission | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_dms_document_permissions WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
    return res.rows[0] ? rowToPermission(res.rows[0]) : null;
  }
}
