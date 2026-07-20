import { type Id, newId } from '../domain/id';
import type { Document } from './document';

// Document Access Control — the sharing layer of the kernel DMS.
//
// WHY THIS IS NOT THE EXISTING RBAC. `identity/access.ts` already has Grant + Scope, and Scope
// even supports `{ kind: 'resource' }`. But a Grant binds ONE USER to a ROLE and is an
// administrative act; a share is created and revoked by an end user, targets teams and companies
// as well as people, and is per-document. Modelling shares as Grants would turn every "send this
// to the estimator" into an admin-grade role assignment.
//
// So the two COMPOSE rather than compete: RBAC answers "may this person touch documents at all",
// this answers "may they touch THIS one". A caller checks RBAC first and this second; neither
// alone is sufficient, and this layer never widens what RBAC refused.
//
// Deny by default, everywhere. Nothing here returns an allow it was not explicitly given.

export type DocumentSubjectType = 'USER' | 'TEAM' | 'ROLE' | 'COMPANY';

/**
 * What a share lets the subject do. This is a LATTICE, not a ladder — SHARE and APPROVE are
 * capabilities in their own right, not "more than EDIT". An approver often must not edit, and a
 * coordinator may share a document they are not allowed to change.
 */
export type DocumentPermissionLevel = 'VIEW' | 'DOWNLOAD' | 'COMMENT' | 'EDIT' | 'SHARE' | 'APPROVE';

export const DOCUMENT_PERMISSION_LEVELS: readonly DocumentPermissionLevel[] = [
  'VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE', 'APPROVE',
];

/**
 * What each level implies. Everything implies VIEW — you cannot download, comment on, edit,
 * share or approve a document you may not see. EDIT implies DOWNLOAD and COMMENT because
 * uploading a new version without being able to read the current one is not a coherent grant.
 */
const IMPLIES: Record<DocumentPermissionLevel, readonly DocumentPermissionLevel[]> = {
  VIEW: ['VIEW'],
  DOWNLOAD: ['DOWNLOAD', 'VIEW'],
  COMMENT: ['COMMENT', 'VIEW'],
  EDIT: ['EDIT', 'DOWNLOAD', 'COMMENT', 'VIEW'],
  SHARE: ['SHARE', 'VIEW'],
  APPROVE: ['APPROVE', 'VIEW'],
};

export function permissionImplies(held: DocumentPermissionLevel, requested: DocumentPermissionLevel): boolean {
  return IMPLIES[held].includes(requested);
}

export interface DocumentPermission {
  id: Id;
  tenantId: Id;
  documentId: Id;
  subjectType: DocumentSubjectType;
  /** User id, team id, role id, or company id depending on `subjectType`. */
  subjectId: Id;
  permission: DocumentPermissionLevel;
  grantedBy: Id | null;
  grantedAt: string;
  /** Optional expiry — a share to an external reviewer should not outlive the review. */
  expiresAt: string | null;
}

export interface NewDocumentPermission {
  tenantId: Id;
  documentId: Id;
  subjectType: DocumentSubjectType;
  subjectId: Id;
  permission: DocumentPermissionLevel;
  grantedBy?: Id | null;
  expiresAt?: string | null;
}

export function makeDocumentPermission(input: NewDocumentPermission, now = new Date()): DocumentPermission {
  if (!input.subjectId?.trim()) throw new Error('a share needs a subject');
  return {
    id: newId(),
    tenantId: input.tenantId,
    documentId: input.documentId,
    subjectType: input.subjectType,
    subjectId: input.subjectId.trim(),
    permission: input.permission,
    grantedBy: input.grantedBy ?? null,
    grantedAt: now.toISOString(),
    expiresAt: input.expiresAt ?? null,
  };
}

/**
 * What the creator keeps by virtue of having created the document.
 *
 * APPROVE is deliberately ABSENT. Approval is a functional responsibility, not a property of
 * authorship — the person who drafts a contract is precisely the person who should not sign it
 * off, and a creator who has since left the company must not retain approval rights on
 * everything they ever uploaded. It is a policy value rather than a constant so a tenant that
 * disagrees can change it without editing the resolver.
 *
 * This is a FLOOR, not a ceiling: an explicit share can still grant the creator APPROVE, and the
 * resolver unions the two rather than short-circuiting on ownership.
 */
export interface DocumentOwnerPolicy {
  creator: readonly DocumentPermissionLevel[];
}

export const DEFAULT_OWNER_POLICY: DocumentOwnerPolicy = {
  creator: ['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE'],
};

/** Who is asking, and everything they belong to. Teams/roles/company come from the session. */
export interface DocumentActor {
  userId: Id;
  tenantId: Id;
  teamIds?: Id[];
  roleIds?: Id[];
  companyId?: Id | null;
}

export interface DocumentAccessDecision {
  allowed: boolean;
  reason: string;
  /** Everything the actor may do, after implications — for rendering the UI without re-asking. */
  effective: DocumentPermissionLevel[];
}

function isLive(p: DocumentPermission, nowIso: string): boolean {
  return p.expiresAt === null || p.expiresAt > nowIso;
}

/** Does this permission's subject match the actor? */
function subjectMatches(p: DocumentPermission, actor: DocumentActor): boolean {
  switch (p.subjectType) {
    case 'USER': return p.subjectId === actor.userId;
    case 'TEAM': return (actor.teamIds ?? []).includes(p.subjectId);
    case 'ROLE': return (actor.roleIds ?? []).includes(p.subjectId);
    // A company-wide share reaches everyone IN that company, not everyone in the tenant.
    case 'COMPANY': return !!actor.companyId && p.subjectId === actor.companyId;
    default: return false;
  }
}

/**
 * Resolve what an actor may do with a document.
 *
 *   1. Cross-tenant is denied unconditionally, before anything else is read. A share can never
 *      reach across tenants however it was written — the same isolation the storage-key layout
 *      enforces, restated where the decision is actually made.
 *   2. The creator keeps DocumentOwnerPolicy.creator (not everything — see the policy), so they
 *      cannot share their own document away and lock themselves out of it.
 */
export function resolveDocumentAccess(
  doc: Pick<Document, 'id' | 'tenantId' | 'createdBy'>,
  permissions: DocumentPermission[],
  actor: DocumentActor,
  now = new Date(),
  policy: DocumentOwnerPolicy = DEFAULT_OWNER_POLICY,
): DocumentAccessDecision {
  if (doc.tenantId !== actor.tenantId) {
    return { allowed: false, reason: 'cross-tenant access is never permitted', effective: [] };
  }

  const effective = new Set<DocumentPermissionLevel>();
  const reasons: string[] = [];

  // Ownership is a FLOOR, not a short-circuit: the creator keeps the policy's levels AND anything
  // additionally shared with them. Returning early here would have silently discarded an explicit
  // grant — including the APPROVE the policy deliberately withholds.
  const isOwner = !!doc.createdBy && doc.createdBy === actor.userId;
  if (isOwner) {
    for (const level of policy.creator) for (const implied of IMPLIES[level]) effective.add(implied);
    reasons.push('owner');
  }

  const nowIso = now.toISOString();
  const mine = permissions.filter(
    (p) => p.documentId === doc.id && p.tenantId === doc.tenantId && isLive(p, nowIso) && subjectMatches(p, actor),
  );
  for (const p of mine) for (const level of IMPLIES[p.permission]) effective.add(level);
  if (mine.length > 0) {
    reasons.push(`shared via ${[...new Set(mine.map((p) => p.subjectType.toLowerCase()))].join(', ')}`);
  }

  if (effective.size === 0) {
    return { allowed: false, reason: 'not shared with this user', effective: [] };
  }

  return {
    allowed: true,
    reason: reasons.join(' + '),
    effective: DOCUMENT_PERMISSION_LEVELS.filter((l) => effective.has(l)),
  };
}

/** Convenience for the API edge: may this actor do exactly this? */
export function canDocument(
  doc: Pick<Document, 'id' | 'tenantId' | 'createdBy'>,
  permissions: DocumentPermission[],
  actor: DocumentActor,
  requested: DocumentPermissionLevel,
  now = new Date(),
  policy: DocumentOwnerPolicy = DEFAULT_OWNER_POLICY,
): boolean {
  return resolveDocumentAccess(doc, permissions, actor, now, policy).effective.includes(requested);
}

/** Thrown when a document action is refused. Mapped to 403 at the API edge. */
export class DocumentAccessDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(`Document access denied: ${reason}`);
    this.name = 'DocumentAccessDeniedError';
  }
}
