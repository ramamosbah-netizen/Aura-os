import { type Id, newId } from '../domain/id';

// Framework-free Document model — the kernel DMS substrate. Tender, Drawing,
// Submittal, Contract, Invoice are all Documents linked to some aggregate, with an
// immutable version history. Modules attach documents; they never re-implement this.

export type DocumentStatus = 'active' | 'archived';

/** A document attached to any aggregate (mirrors DomainEvent's module.aggregate link). */
export interface Document {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Open classifier — e.g. 'drawing' | 'contract' | 'invoice' | 'submittal'. */
  kind: string;
  title: string;
  aggregateType: string;
  aggregateId: Id;
  status: DocumentStatus;
  /** Highest version number (1-based); a document always has ≥1 version. */
  currentVersion: number;
  createdAt: string;
  createdBy: Id | null;
}

/** An immutable revision of a document's content (append-only history). */
export interface DocumentVersion {
  id: Id;
  documentId: Id;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Opaque key into the DocumentStorage backend. */
  storageKey: string;
  /** Content hash for integrity / dedup. */
  checksum: string | null;
  note: string | null;
  uploadedAt: string;
  uploadedBy: Id | null;
}

export interface NewDocument {
  tenantId: Id;
  companyId?: Id | null;
  kind: string;
  title: string;
  aggregateType: string;
  aggregateId: Id;
  createdBy?: Id | null;
}

/** Build a Document at version 1 (it's created together with its first content). */
export function makeDocument(input: NewDocument): Document {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    kind: input.kind,
    title: input.title,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    status: 'active',
    currentVersion: 1,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export interface NewDocumentVersion {
  documentId: Id;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  checksum?: string | null;
  note?: string | null;
  uploadedBy?: Id | null;
}

export function makeDocumentVersion(input: NewDocumentVersion): DocumentVersion {
  return {
    id: newId(),
    documentId: input.documentId,
    version: input.version,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    checksum: input.checksum ?? null,
    note: input.note ?? null,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uploadedBy ?? null,
  };
}

/** The next version number for an existing document. */
export function nextVersionNumber(doc: Pick<Document, 'currentVersion'>): number {
  return doc.currentVersion + 1;
}

/** Deterministic, collision-free storage key: tenant/aggregate/doc/vN-filename (sanitized). */
export function storageKeyFor(
  doc: Pick<Document, 'tenantId' | 'aggregateType' | 'aggregateId' | 'id'>,
  version: number,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
  return `${doc.tenantId}/${doc.aggregateType}/${doc.aggregateId}/${doc.id}/v${version}-${safe}`;
}

/** DMS event types emitted on the spine. */
export const DMS_EVENT = {
  created: 'dms.document.created',
  versionAdded: 'dms.document.version_added',
  archived: 'dms.document.archived',
  // Sharing is a state change like any other, so it goes on the spine. Intelligence later
  // needs to answer "why did this contract reach Legal" and "who was given sight of the
  // quotation" — questions only an event log can answer after the fact.
  shared: 'dms.document.shared',
  unshared: 'dms.document.unshared',
} as const;
