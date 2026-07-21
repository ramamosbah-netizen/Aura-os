import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DMS_EVENT,
  DocumentAccessDeniedError,
  type Document,
  type DocumentAccessDecision,
  type DocumentActor,
  type DocumentPermission,
  type DocumentPermissionLevel,
  type DocumentVersion,
  type Id,
  type NewDocument,
  type NewDocumentPermission,
  makeDocument,
  makeDocumentPermission,
  makeDocumentVersion,
  makeEvent,
  nextVersionNumber,
  resolveDocumentAccess,
  storageKeyFor,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '../events/event-store';
import { DOCUMENT_STORE, type DocumentFilter, type DocumentStore, type DocumentWithVersions } from './document-store';
import { DOCUMENT_STORAGE, type DocumentStorage } from './document-storage';
import {
  DOCUMENT_PERMISSION_STORE,
  type DocumentPermissionStore,
  type SubjectRef,
} from './document-permission-store';

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
    @Inject(DOCUMENT_PERMISSION_STORE) private readonly permissions: DocumentPermissionStore,
  ) {}

  /** Every subject an actor is, for shared-with-me and bulk resolution. */
  private static subjectsOf(actor: DocumentActor): SubjectRef[] {
    const subjects: SubjectRef[] = [{ subjectType: 'USER', subjectId: actor.userId }];
    for (const t of actor.teamIds ?? []) subjects.push({ subjectType: 'TEAM', subjectId: t });
    for (const r of actor.roleIds ?? []) subjects.push({ subjectType: 'ROLE', subjectId: r });
    if (actor.companyId) subjects.push({ subjectType: 'COMPANY', subjectId: actor.companyId });
    return subjects;
  }

  /** What may this actor do with this document? */
  async access(documentId: Id, actor: DocumentActor): Promise<DocumentAccessDecision> {
    const found = await this.store.get(documentId);
    if (!found) return { allowed: false, reason: 'document not found', effective: [] };
    const perms = await this.permissions.listForDocument(documentId);
    return resolveDocumentAccess(found.document, perms, actor);
  }

  /**
   * The single gate. Every command below goes through it, so a new command cannot be added
   * without deciding what it requires.
   */
  private async assertCan(
    documentId: Id,
    actor: DocumentActor,
    required: DocumentPermissionLevel,
  ): Promise<DocumentWithVersions> {
    const found = await this.store.get(documentId);
    // Same answer for missing and not-yours: distinguishing them tells an unauthorised caller
    // that the document exists, which is itself a disclosure.
    if (!found) throw new DocumentAccessDeniedError('document not found');
    const perms = await this.permissions.listForDocument(documentId);
    const decision = resolveDocumentAccess(found.document, perms, actor);
    if (!decision.effective.includes(required)) {
      throw new DocumentAccessDeniedError(`${required.toLowerCase()} refused — ${decision.reason}`);
    }
    return found;
  }

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

  async addVersion(
    documentId: Id,
    file: DocumentFileInput,
    actor: DocumentActor,
    note?: string,
  ): Promise<DocumentVersion> {
    // Uploading over someone's document is an edit, not a read.
    const existing = await this.assertCan(documentId, actor, 'EDIT');
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
      uploadedBy: actor.userId,
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

  /** Metadata for one document, if the actor may see it. */
  async getFor(id: Id, actor: DocumentActor): Promise<DocumentWithVersions> {
    return this.assertCan(id, actor, 'VIEW');
  }

  /**
   * List, filtered to what this actor may actually see.
   *
   * Permissions are fetched ONCE for the actor's subjects and resolved in memory. Checking each
   * document separately would be a query per row — the same N+1 shape that cost a page four
   * seconds elsewhere in this codebase.
   */
  async listFor(filter: DocumentFilter, actor: DocumentActor): Promise<Document[]> {
    const docs = await this.store.list({ ...filter, tenantId: actor.tenantId });
    const mine = await this.permissions.listForSubjects(actor.tenantId, DmsService.subjectsOf(actor));
    const byDoc = new Map<string, DocumentPermission[]>();
    for (const p of mine) byDoc.set(p.documentId, [...(byDoc.get(p.documentId) ?? []), p]);
    return docs.filter((d) => resolveDocumentAccess(d, byDoc.get(d.id) ?? [], actor).allowed);
  }

  /** Documents shared with this actor — excludes their own, which they reach by ownership. */
  async sharedWithMe(actor: DocumentActor): Promise<Array<{ document: Document; permissions: DocumentPermission[] }>> {
    const mine = await this.permissions.listForSubjects(actor.tenantId, DmsService.subjectsOf(actor));
    const byDoc = new Map<string, DocumentPermission[]>();
    for (const p of mine) byDoc.set(p.documentId, [...(byDoc.get(p.documentId) ?? []), p]);
    const out: Array<{ document: Document; permissions: DocumentPermission[] }> = [];
    for (const [documentId, permissions] of byDoc) {
      const found = await this.store.get(documentId);
      if (!found || found.document.tenantId !== actor.tenantId) continue;
      if (found.document.createdBy === actor.userId) continue;
      out.push({ document: found.document, permissions });
    }
    return out;
  }

  /** Who has access to this document, for the who-can-see-this view. */
  async listAccess(documentId: Id, actor: DocumentActor): Promise<DocumentPermission[]> {
    await this.assertCan(documentId, actor, 'VIEW');
    return this.permissions.listForDocument(documentId);
  }

  /**
   * Read a version's bytes — DOWNLOAD-checked against the document.
   *
   * This replaces a readContent(storageKey) that took a raw storage key with no document
   * context: anyone holding a key could read the bytes, and no permission model could have
   * stopped them. Bytes are now only reachable through the document that owns them.
   */
  async downloadVersion(
    documentId: Id,
    version: number | null,
    actor: DocumentActor,
  ): Promise<{ bytes: Buffer; version: DocumentVersion }> {
    const found = await this.assertCan(documentId, actor, 'DOWNLOAD');
    const wanted = version ?? found.document.currentVersion;
    const v = found.versions.find((x) => x.version === wanted);
    if (!v) throw new Error(`document ${documentId} has no version ${wanted}`);
    return { bytes: await this.storage.read(v.storageKey), version: v };
  }

  /** Share a document. Requires SHARE on it — being able to read is not being able to pass on. */
  async share(input: NewDocumentPermission, actor: DocumentActor): Promise<DocumentPermission> {
    const found = await this.assertCan(input.documentId, actor, 'SHARE');
    const permission = makeDocumentPermission({
      ...input,
      tenantId: found.document.tenantId,
      grantedBy: actor.userId,
    });
    await this.permissions.grant(permission);
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.shared,
        tenantId: found.document.tenantId,
        companyId: found.document.companyId,
        actorId: actor.userId,
        aggregateType: 'dms.document',
        aggregateId: found.document.id,
        payload: {
          permissionId: permission.id,
          subjectType: permission.subjectType,
          subjectId: permission.subjectId,
          permission: permission.permission,
          expiresAt: permission.expiresAt,
        },
      }),
    ]);
    this.logger.log(
      `Shared ${found.document.id} with ${permission.subjectType}:${permission.subjectId} (${permission.permission})`,
    );
    return permission;
  }

  /** Revoke a share. Requires SHARE — whoever may grant access may take it away. */
  async revokeShare(documentId: Id, permissionId: Id, actor: DocumentActor): Promise<boolean> {
    const found = await this.assertCan(documentId, actor, 'SHARE');
    const existing = await this.permissions.get(permissionId);
    // A permission id belonging to another document must not be revocable through this one.
    if (!existing || existing.documentId !== documentId) return false;
    const revoked = await this.permissions.revoke(permissionId, actor.userId);
    if (!revoked) return false;
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.unshared,
        tenantId: found.document.tenantId,
        companyId: found.document.companyId,
        actorId: actor.userId,
        aggregateType: 'dms.document',
        aggregateId: documentId,
        payload: {
          permissionId,
          subjectType: existing.subjectType,
          subjectId: existing.subjectId,
          permission: existing.permission,
        },
      }),
    ]);
    this.logger.log(
      `Revoked ${existing.permission} on ${documentId} from ${existing.subjectType}:${existing.subjectId}`,
    );
    return true;
  }
}
