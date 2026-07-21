import type { DocumentPermission, Id } from '@aura/shared';
import type { DocumentPermissionStore, SubjectRef } from './document-permission-store';

/** Revocation metadata kept beside the grant — the shared model carries only live fields. */
interface Row extends DocumentPermission {
  revokedAt: string | null;
  revokedBy: Id | null;
}

/** Phase-0 sharing store — keeps grants in memory. Mirrors the Postgres semantics exactly. */
export class InMemoryDocumentPermissionStore implements DocumentPermissionStore {
  private readonly rows = new Map<string, Row>();

  private live(): Row[] {
    return [...this.rows.values()].filter((r) => r.revokedAt === null);
  }

  /** Strip the revocation columns — callers get the shared shape, nothing more. */
  private static toPermission(r: Row): DocumentPermission {
    const { revokedAt: _a, revokedBy: _b, ...permission } = r;
    return { ...permission };
  }

  async grant(permission: DocumentPermission): Promise<void> {
    // Matches the partial unique index in 0183: one LIVE grant per
    // (document, subject, permission). Re-sharing the same thing is a no-op, not a second row
    // that would then have to be revoked twice.
    const duplicate = this.live().find(
      (r) =>
        r.documentId === permission.documentId &&
        r.subjectType === permission.subjectType &&
        r.subjectId === permission.subjectId &&
        r.permission === permission.permission,
    );
    if (duplicate) return;
    this.rows.set(permission.id, { ...permission, revokedAt: null, revokedBy: null });
  }

  async listForDocument(documentId: Id): Promise<DocumentPermission[]> {
    return this.live()
      .filter((r) => r.documentId === documentId)
      .map(InMemoryDocumentPermissionStore.toPermission);
  }

  async listForSubjects(tenantId: Id, subjects: SubjectRef[]): Promise<DocumentPermission[]> {
    if (subjects.length === 0) return [];
    const wanted = new Set(subjects.map((s) => `${s.subjectType}:${s.subjectId}`));
    return this.live()
      .filter((r) => r.tenantId === tenantId && wanted.has(`${r.subjectType}:${r.subjectId}`))
      .map(InMemoryDocumentPermissionStore.toPermission);
  }

  async revoke(id: Id, revokedBy: Id | null, at = new Date()): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.revokedAt !== null) return false;
    row.revokedAt = at.toISOString();
    row.revokedBy = revokedBy;
    return true;
  }

  async get(id: Id): Promise<DocumentPermission | null> {
    const row = this.rows.get(id);
    if (!row || row.revokedAt !== null) return null;
    return InMemoryDocumentPermissionStore.toPermission(row);
  }
}
