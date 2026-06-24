import type { Document, DocumentVersion, Id } from '@aura/shared';
import type { DocumentFilter, DocumentStore, DocumentWithVersions } from './document-store';

/** Phase-0 metadata store — keeps documents + versions in memory. */
export class InMemoryDocumentStore implements DocumentStore {
  private readonly docs = new Map<string, Document>();
  private readonly versions = new Map<string, DocumentVersion[]>();

  async create(document: Document, firstVersion: DocumentVersion): Promise<void> {
    this.docs.set(document.id, { ...document });
    this.versions.set(document.id, [{ ...firstVersion }]);
  }

  async addVersion(documentId: Id, version: DocumentVersion, newCurrentVersion: number): Promise<void> {
    const doc = this.docs.get(documentId);
    if (!doc) throw new Error(`document not found: ${documentId}`);
    doc.currentVersion = newCurrentVersion;
    (this.versions.get(documentId) ?? []).push({ ...version });
  }

  async get(id: Id): Promise<DocumentWithVersions | null> {
    const document = this.docs.get(id);
    if (!document) return null;
    return { document: { ...document }, versions: [...(this.versions.get(id) ?? [])] };
  }

  async list(filter: DocumentFilter = {}): Promise<Document[]> {
    let out = [...this.docs.values()];
    if (filter.tenantId) out = out.filter((d) => d.tenantId === filter.tenantId);
    if (filter.aggregateType) out = out.filter((d) => d.aggregateType === filter.aggregateType);
    if (filter.aggregateId) out = out.filter((d) => d.aggregateId === filter.aggregateId);
    if (filter.kind) out = out.filter((d) => d.kind === filter.kind);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
