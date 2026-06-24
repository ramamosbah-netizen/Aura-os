import type { Document, DocumentVersion, Id } from '@aura/shared';

/** DI token for the document metadata store. */
export const DOCUMENT_STORE = Symbol('DOCUMENT_STORE');

export interface DocumentFilter {
  tenantId?: string;
  aggregateType?: string;
  aggregateId?: string;
  kind?: string;
  limit?: number;
}

export interface DocumentWithVersions {
  document: Document;
  versions: DocumentVersion[];
}

/**
 * Metadata persistence for documents + their immutable version history. Postgres
 * impl in production; in-memory stand-in so the API boots without a DB.
 */
export interface DocumentStore {
  create(document: Document, firstVersion: DocumentVersion): Promise<void>;
  addVersion(documentId: Id, version: DocumentVersion, newCurrentVersion: number): Promise<void>;
  get(id: Id): Promise<DocumentWithVersions | null>;
  list(filter?: DocumentFilter): Promise<Document[]>;
}
