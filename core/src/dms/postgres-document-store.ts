import type { Pool, PoolClient } from 'pg';
import type { Document, DocumentVersion, Id } from '@aura/shared';
import type { DocumentFilter, DocumentStore, DocumentWithVersions } from './document-store';

interface DocRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  kind: string;
  title: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  current_version: number;
  created_by: string | null;
  created_at: Date | string;
}

interface VerRow {
  id: string;
  document_id: string;
  version: number;
  file_name: string;
  content_type: string;
  size_bytes: string | number;
  storage_key: string;
  checksum: string | null;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToDoc(r: DocRow): Document {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    kind: r.kind,
    title: r.title,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    status: r.status as Document['status'],
    currentVersion: r.current_version,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
  };
}

function rowToVer(r: VerRow): DocumentVersion {
  return {
    id: r.id,
    documentId: r.document_id,
    version: r.version,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    storageKey: r.storage_key,
    checksum: r.checksum,
    note: r.note,
    uploadedAt: iso(r.uploaded_at),
    uploadedBy: r.uploaded_by,
  };
}

const DOC_COLS =
  'id, tenant_id, company_id, kind, title, aggregate_type, aggregate_id, status, current_version, created_by, created_at';
const VER_COLS =
  'id, document_id, version, file_name, content_type, size_bytes, storage_key, checksum, note, uploaded_by, uploaded_at';

/** Durable document metadata on Postgres (`aura_documents` + `aura_document_versions`). */
export class PostgresDocumentStore implements DocumentStore {
  constructor(private readonly pool: Pool) {}

  async create(document: Document, firstVersion: DocumentVersion): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.aura_documents (${DOC_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          document.id,
          document.tenantId,
          document.companyId,
          document.kind,
          document.title,
          document.aggregateType,
          document.aggregateId,
          document.status,
          document.currentVersion,
          document.createdBy,
          document.createdAt,
        ],
      );
      await this.insertVersion(client, firstVersion);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async addVersion(documentId: Id, version: DocumentVersion, newCurrentVersion: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.insertVersion(client, version);
      await client.query('UPDATE public.aura_documents SET current_version = $2 WHERE id = $1', [
        documentId,
        newCurrentVersion,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertVersion(client: PoolClient, v: DocumentVersion): Promise<void> {
    await client.query(
      `INSERT INTO public.aura_document_versions (${VER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [v.id, v.documentId, v.version, v.fileName, v.contentType, v.sizeBytes, v.storageKey, v.checksum, v.note, v.uploadedBy, v.uploadedAt],
    );
  }

  async get(id: Id): Promise<DocumentWithVersions | null> {
    const docRes = await this.pool.query<DocRow>(
      `SELECT ${DOC_COLS} FROM public.aura_documents WHERE id = $1`,
      [id],
    );
    if (docRes.rows.length === 0) return null;
    const verRes = await this.pool.query<VerRow>(
      `SELECT ${VER_COLS} FROM public.aura_document_versions WHERE document_id = $1 ORDER BY version ASC`,
      [id],
    );
    return { document: rowToDoc(docRes.rows[0]), versions: verRes.rows.map(rowToVer) };
  }

  async list(filter: DocumentFilter = {}): Promise<Document[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('aggregate_type', filter.aggregateType);
    add('aggregate_id', filter.aggregateId);
    add('kind', filter.kind);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<DocRow>(
      `SELECT ${DOC_COLS} FROM public.aura_documents ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToDoc);
  }
}
