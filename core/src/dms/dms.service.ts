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
import { DOCUMENT_PERMISSION_STORE, type DocumentPermissionStore } from './document-permission-store';
import {
  DocumentAccessResolver,
  POLICY_VERSION,
  snapshotOf,
  type AccessDecision,
} from './document-access-resolver';

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
    private readonly access_: DocumentAccessResolver,
  ) {}

  /** What may this actor do with this document, and why? Delegated — this service holds no policy. */
  access(documentId: Id, actor: DocumentActor): Promise<AccessDecision> {
    return this.access_
      .authorizeById(documentId, actor)
      .then((r) => r?.decision ?? { allowed: false, permissions: [], effective: [], policyVersion: POLICY_VERSION });
  }

  /**
   * Assert a level and return the document. The DECISION comes from the resolver — this service
   * never re-implements the rule, it only says which level each command needs.
   */
  private async assertCan(
    documentId: Id,
    actor: DocumentActor,
    required: DocumentPermissionLevel,
  ): Promise<DocumentWithVersions> {
    try {
      await this.access_.assert(documentId, actor, required);
    } catch (err) {
      // A refusal is an audit fact. "Who tried to reach this and was turned away" is a question
      // only a recorded denial can answer, and it is the one that matters after an incident.
      await this.recordDenied(documentId, actor, required);
      throw err;
    }
    const found = await this.store.get(documentId);
    if (!found) throw new DocumentAccessDeniedError('document not found');
    return found;
  }

  private async recordDenied(
    documentId: Id,
    actor: DocumentActor,
    required: DocumentPermissionLevel,
  ): Promise<void> {
    const resolved = await this.access_.authorizeById(documentId, actor);
    // No document, no aggregate to attach an event to — the 403 is still returned.
    if (!resolved) return;
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.accessDenied,
        tenantId: resolved.document.tenantId,
        companyId: resolved.document.companyId,
        actorId: actor.userId,
        aggregateType: 'dms.document',
        aggregateId: documentId,
        payload: { decision: snapshotOf(resolved.decision, required) },
      }),
    ]);
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
    const mine = await this.permissions.listForSubjects(actor.tenantId, DocumentAccessResolver.subjectsOf(actor));
    const byDoc = new Map<string, DocumentPermission[]>();
    for (const p of mine) byDoc.set(p.documentId, [...(byDoc.get(p.documentId) ?? []), p]);
    const visible: Document[] = [];
    for (const d of docs) {
      const decision = await this.access_.authorize(d, actor, byDoc.get(d.id) ?? []);
      if (decision.allowed) visible.push(d);
    }
    return visible;
  }

  /** Documents shared with this actor — excludes their own, which they reach by ownership. */
  async sharedWithMe(actor: DocumentActor): Promise<Array<{ document: Document; permissions: DocumentPermission[] }>> {
    const mine = await this.permissions.listForSubjects(actor.tenantId, DocumentAccessResolver.subjectsOf(actor));
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

    // Read FIRST. The event is emitted only once bytes are actually in hand: if storage fails,
    // nobody downloaded anything and the trail must not say otherwise.
    const bytes = await this.storage.read(v.storageKey);

    const decision = await this.access_.authorizeById(documentId, actor);
    await this.events.append([
      makeEvent({
        type: DMS_EVENT.downloadCompleted,
        tenantId: found.document.tenantId,
        companyId: found.document.companyId,
        actorId: actor.userId,
        aggregateType: 'dms.document',
        aggregateId: documentId,
        payload: {
          version: v.version,
          fileName: v.fileName,
          sizeBytes: v.sizeBytes,
          decision: decision ? snapshotOf(decision.decision, 'DOWNLOAD') : null,
        },
      }),
    ]);
    return { bytes, version: v };
  }

  /**
   * Share a document.
   *
   * Requires SHARE **and** that the actor may delegate the level being granted:
   * `granted ⊆ delegable(actor)`. Holding SHARE lets you pass on what you HAVE; it does not let
   * you mint authority you were never given. Before this check, anyone with VIEW + SHARE could
   * grant APPROVE — which also let a creator hand themselves the APPROVE the owner policy
   * deliberately withholds. That was live and exploitable.
   */
  async share(input: NewDocumentPermission, actor: DocumentActor): Promise<DocumentPermission> {
    const authorising = await this.access_.assertCanDelegate(input.documentId, actor, input.permission);
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
          // The authority the granter was acting under, frozen. Team membership and shares
          // change; an old grant must stay explicable by what was true when it was made.
          decision: snapshotOf(authorising, 'SHARE'),
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
    const authorising = await this.access_.assert(documentId, actor, 'SHARE');
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
          decision: snapshotOf(authorising, 'SHARE'),
        },
      }),
    ]);
    this.logger.log(
      `Revoked ${existing.permission} on ${documentId} from ${existing.subjectType}:${existing.subjectId}`,
    );
    return true;
  }
}
