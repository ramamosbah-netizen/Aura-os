import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DMS_EVENT,
  type Document,
  type DocumentVersion,
  type Id,
  type NewDocument,
  makeDocument,
  makeDocumentVersion,
  makeEvent,
  nextVersionNumber,
  storageKeyFor,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '../events/event-store';
import { DOCUMENT_STORE, type DocumentFilter, type DocumentStore, type DocumentWithVersions } from './document-store';
import { DOCUMENT_STORAGE, type DocumentStorage } from './document-storage';

export interface DocumentFileInput {
  fileName: string;
  contentType: string;
  data: Buffer;
}

/**
 * Kernel DMS facade. Modules call this to attach versioned documents to any
 * aggregate; they never touch storage or the metadata store directly. Each mutation
 * persists metadata, stores bytes, and emits a `dms.document.*` event on the spine
 * (so the relay/projectors/Intelligence see every document change).
 */
@Injectable()
export class DmsService {
  private readonly logger = new Logger('Dms');

  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async createDocument(input: NewDocument, file: DocumentFileInput): Promise<DocumentWithVersions> {
    const doc = makeDocument(input);
    const key = storageKeyFor(doc, 1, file.fileName);
    const stored = await this.storage.put(key, file.data, file.contentType);
    const version = makeDocumentVersion({
      documentId: doc.id,
      version: 1,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      checksum: stored.checksum,
      uploadedBy: input.createdBy ?? null,
    });
    await this.store.create(doc, version);
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.created,
        tenantId: doc.tenantId,
        companyId: doc.companyId,
        actorId: doc.createdBy,
        aggregateType: 'dms.document',
        aggregateId: doc.id,
        payload: {
          kind: doc.kind,
          title: doc.title,
          fileName: version.fileName,
          version: 1,
          linkedTo: { aggregateType: doc.aggregateType, aggregateId: doc.aggregateId },
        },
      }),
    ]);
    this.logger.log(`Created ${doc.kind} "${doc.title}" (${doc.id}) v1 → ${doc.aggregateType}:${doc.aggregateId}`);
    return { document: doc, versions: [version] };
  }

  async addVersion(documentId: Id, file: DocumentFileInput, note?: string): Promise<DocumentVersion> {
    const existing = await this.store.get(documentId);
    if (!existing) throw new Error(`document not found: ${documentId}`);
    const v = nextVersionNumber(existing.document);
    const key = storageKeyFor(existing.document, v, file.fileName);
    const stored = await this.storage.put(key, file.data, file.contentType);
    const version = makeDocumentVersion({
      documentId,
      version: v,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      checksum: stored.checksum,
      note: note ?? null,
    });
    await this.store.addVersion(documentId, version, v);
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.versionAdded,
        tenantId: existing.document.tenantId,
        companyId: existing.document.companyId,
        aggregateType: 'dms.document',
        aggregateId: documentId,
        payload: {
          version: v,
          fileName: version.fileName,
          linkedTo: {
            aggregateType: existing.document.aggregateType,
            aggregateId: existing.document.aggregateId,
          },
        },
      }),
    ]);
    this.logger.log(`Added version v${v} to document ${documentId}`);
    return version;
  }

  get(id: Id): Promise<DocumentWithVersions | null> {
    return this.store.get(id);
  }

  list(filter?: DocumentFilter): Promise<Document[]> {
    return this.store.list(filter);
  }

  /** Read a version's bytes back from storage (by its storageKey). */
  readContent(storageKey: string): Promise<Buffer> {
    return this.storage.read(storageKey);
  }
}
