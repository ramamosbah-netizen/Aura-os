import type { DocumentPermission, DocumentSubjectType, Id } from '@aura/shared';

/** DI token for the document sharing store. */
export const DOCUMENT_PERMISSION_STORE = Symbol('DOCUMENT_PERMISSION_STORE');

/** One subject the caller belongs to, for "what is shared with me" queries. */
export interface SubjectRef {
  subjectType: DocumentSubjectType;
  subjectId: Id;
}

/**
 * Persistence for document shares.
 *
 * Revocation is a soft delete: `revoke` stamps `revokedAt`/`revokedBy` and every read below
 * returns LIVE grants only. A hard delete would leave "who gave the client access to this
 * contract, and when did we take it away" unanswerable, which is the question this table
 * exists to answer.
 */
export interface DocumentPermissionStore {
  grant(permission: DocumentPermission): Promise<void>;
  /** Live grants on one document — the resolver's hot path. */
  listForDocument(documentId: Id): Promise<DocumentPermission[]>;
  /** Live grants naming any of these subjects — powers "shared with me". */
  listForSubjects(tenantId: Id, subjects: SubjectRef[]): Promise<DocumentPermission[]>;
  /** Soft-revoke one grant. Returns false when it does not exist or is already revoked. */
  revoke(id: Id, revokedBy: Id | null, at?: Date): Promise<boolean>;
  get(id: Id): Promise<DocumentPermission | null>;
}
