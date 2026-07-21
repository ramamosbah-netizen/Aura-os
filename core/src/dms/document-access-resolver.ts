import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_OWNER_POLICY,
  DocumentAccessDeniedError,
  type Document,
  type DocumentActor,
  type DocumentOwnerPolicy,
  type DocumentPermission,
  type DocumentPermissionLevel,
  type DocumentSubjectType,
  type Id,
} from '@aura/shared';
import { DOCUMENT_PERMISSION_STORE, type DocumentPermissionStore, type SubjectRef } from './document-permission-store';
import { DOCUMENT_STORE, type DocumentStore } from './document-store';

/**
 * THE policy engine for documents. DmsService owns storage and lifecycle; this owns "may they".
 * Nothing else is allowed to decide access — one engine, so a new command cannot quietly invent
 * its own rule, and an audit log has a single place to read its reasons from.
 */

/** Why access was granted — structured, not prose, so events and audit views can filter on it. */
export type AccessReasonKind =
  | 'owner'
  | 'shared-user'
  | 'shared-team'
  | 'shared-role'
  | 'shared-company'
  | 'inherited-context';

export interface AccessReason {
  kind: AccessReasonKind;
  /** What this particular reason contributed, after implications. */
  grants: DocumentPermissionLevel[];
  /** The team/role/company/user the grant came through, when there is one. */
  subjectId?: string;
  /** The permission row, so a revocation can be traced back to the access it enabled. */
  permissionId?: string;
}

export interface AccessDecision {
  allowed: boolean;
  /** Everything the actor may do, after implications and union. */
  permissions: DocumentPermissionLevel[];
  reasons: AccessReason[];
}

/**
 * What an actor may pass on.
 *
 * The rule: `granted ⊆ delegable(actor)`. Holding SHARE lets you pass on what you HAVE — it does
 * not let you mint authority you were never given. Without this, anyone with VIEW + SHARE could
 * grant APPROVE, and the owner policy that deliberately withholds APPROVE from the creator is
 * bypassed by the creator simply sharing it to themselves. That was live and exploitable before
 * this existed.
 *
 * `neverDelegable` is the second lock: some levels should require an administrative act (RBAC)
 * rather than propagating peer to peer, however many people hold them.
 */
export interface DocumentDelegationPolicy {
  neverDelegable: readonly DocumentPermissionLevel[];
}

export const DEFAULT_DELEGATION_POLICY: DocumentDelegationPolicy = {
  neverDelegable: [],
};

const SUBJECT_REASON: Record<DocumentSubjectType, AccessReasonKind> = {
  USER: 'shared-user',
  TEAM: 'shared-team',
  ROLE: 'shared-role',
  COMPANY: 'shared-company',
};

const IMPLIES: Record<DocumentPermissionLevel, readonly DocumentPermissionLevel[]> = {
  VIEW: ['VIEW'],
  DOWNLOAD: ['DOWNLOAD', 'VIEW'],
  COMMENT: ['COMMENT', 'VIEW'],
  EDIT: ['EDIT', 'DOWNLOAD', 'COMMENT', 'VIEW'],
  SHARE: ['SHARE', 'VIEW'],
  APPROVE: ['APPROVE', 'VIEW'],
};

const ORDER: readonly DocumentPermissionLevel[] = ['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE', 'APPROVE'];

/**
 * An extra source of access derived from what the document is attached to — "everyone on the
 * contract team may read the contract's documents". Registered rather than hard-coded so CRM,
 * Tendering and Contracts can each contribute without this file importing any of them.
 */
export interface AccessContextProvider {
  /** Levels this provider grants the actor on a document, or [] for none. */
  grantsFor(document: Document, actor: DocumentActor): Promise<DocumentPermissionLevel[]>;
}

@Injectable()
export class DocumentAccessResolver {
  private readonly contextProviders: AccessContextProvider[] = [];

  constructor(
    @Inject(DOCUMENT_STORE) private readonly documents: DocumentStore,
    @Inject(DOCUMENT_PERMISSION_STORE) private readonly permissions: DocumentPermissionStore,
  ) {}

  // Policies are fields, not constructor parameters: they are interfaces, so they carry no
  // runtime token for Nest to inject and would fail at boot. A tenant overrides them through
  // configure() rather than through DI.
  private ownerPolicy: DocumentOwnerPolicy = DEFAULT_OWNER_POLICY;
  private delegationPolicy: DocumentDelegationPolicy = DEFAULT_DELEGATION_POLICY;

  configure(policies: { owner?: DocumentOwnerPolicy; delegation?: DocumentDelegationPolicy }): void {
    if (policies.owner) this.ownerPolicy = policies.owner;
    if (policies.delegation) this.delegationPolicy = policies.delegation;
  }

  /** Modules register entity-derived access here; nothing in this file knows their shapes. */
  registerContextProvider(provider: AccessContextProvider): void {
    this.contextProviders.push(provider);
  }

  static subjectsOf(actor: DocumentActor): SubjectRef[] {
    const subjects: SubjectRef[] = [{ subjectType: 'USER', subjectId: actor.userId }];
    for (const t of actor.teamIds ?? []) subjects.push({ subjectType: 'TEAM', subjectId: t });
    for (const r of actor.roleIds ?? []) subjects.push({ subjectType: 'ROLE', subjectId: r });
    if (actor.companyId) subjects.push({ subjectType: 'COMPANY', subjectId: actor.companyId });
    return subjects;
  }

  /**
   * The single public question: what may this actor do with this document, and why?
   *
   * `permission` is not a parameter — the decision is computed once and callers test it. Adding
   * DELETE, RESTORE or EXPORT later means adding a level, not another method here and another
   * copy of the policy at every call site.
   */
  async authorize(document: Document, actor: DocumentActor, preloaded?: DocumentPermission[]): Promise<AccessDecision> {
    if (document.tenantId !== actor.tenantId) {
      return { allowed: false, permissions: [], reasons: [] };
    }

    const effective = new Set<DocumentPermissionLevel>();
    const reasons: AccessReason[] = [];
    const add = (levels: readonly DocumentPermissionLevel[]): DocumentPermissionLevel[] => {
      const added: DocumentPermissionLevel[] = [];
      for (const level of levels) {
        for (const implied of IMPLIES[level]) {
          if (!effective.has(implied)) added.push(implied);
          effective.add(implied);
        }
      }
      return ORDER.filter((l) => added.includes(l));
    };

    if (document.createdBy && document.createdBy === actor.userId) {
      reasons.push({ kind: 'owner', grants: add(this.ownerPolicy.creator) });
    }

    const rows = preloaded ?? (await this.permissions.listForDocument(document.id));
    const nowIso = new Date().toISOString();
    for (const p of rows) {
      if (p.documentId !== document.id || p.tenantId !== document.tenantId) continue;
      if (p.expiresAt !== null && p.expiresAt <= nowIso) continue;
      if (!DocumentAccessResolver.matches(p, actor)) continue;
      reasons.push({
        kind: SUBJECT_REASON[p.subjectType],
        grants: add([p.permission]),
        subjectId: p.subjectId,
        permissionId: p.id,
      });
    }

    for (const provider of this.contextProviders) {
      const levels = await provider.grantsFor(document, actor);
      if (levels.length > 0) reasons.push({ kind: 'inherited-context', grants: add(levels) });
    }

    const permissions = ORDER.filter((l) => effective.has(l));
    return { allowed: permissions.length > 0, permissions, reasons };
  }

  private static matches(p: DocumentPermission, actor: DocumentActor): boolean {
    switch (p.subjectType) {
      case 'USER': return p.subjectId === actor.userId;
      case 'TEAM': return (actor.teamIds ?? []).includes(p.subjectId);
      case 'ROLE': return (actor.roleIds ?? []).includes(p.subjectId);
      case 'COMPANY': return !!actor.companyId && p.subjectId === actor.companyId;
      default: return false;
    }
  }

  /** Load the document and authorize in one step — the shape every command needs. */
  async authorizeById(documentId: Id, actor: DocumentActor): Promise<{ document: Document; decision: AccessDecision } | null> {
    const found = await this.documents.get(documentId);
    if (!found) return null;
    return { document: found.document, decision: await this.authorize(found.document, actor) };
  }

  /**
   * Assert a level, or throw. A missing document and an unauthorised one raise the SAME error:
   * telling an unauthorised caller that a document exists is itself a disclosure.
   */
  async assert(documentId: Id, actor: DocumentActor, required: DocumentPermissionLevel): Promise<AccessDecision> {
    const resolved = await this.authorizeById(documentId, actor);
    if (!resolved) throw new DocumentAccessDeniedError('document not found');
    if (!resolved.decision.permissions.includes(required)) {
      throw new DocumentAccessDeniedError(`${required.toLowerCase()} refused`);
    }
    return resolved.decision;
  }

  /** What this actor may pass on: what they hold, minus anything policy forbids delegating. */
  delegable(decision: AccessDecision): DocumentPermissionLevel[] {
    if (!decision.permissions.includes('SHARE')) return [];
    return decision.permissions.filter((l) => !this.delegationPolicy.neverDelegable.includes(l));
  }

  /**
   * Assert the actor may grant exactly this level. Enforces `granted ⊆ delegable(actor)` — the
   * rule that stops VIEW + SHARE being escalated into handing someone APPROVE.
   */
  async assertCanDelegate(
    documentId: Id,
    actor: DocumentActor,
    granting: DocumentPermissionLevel,
  ): Promise<AccessDecision> {
    const decision = await this.assert(documentId, actor, 'SHARE');
    if (!this.delegable(decision).includes(granting)) {
      throw new DocumentAccessDeniedError(
        `cannot grant ${granting.toLowerCase()} — you do not hold it, or it is not delegable`,
      );
    }
    return decision;
  }
}
