import type { Id } from '../domain/id';
import type { OrgLevel } from './org';

/** A permission string `module.aggregate.action`, e.g. `procurement.po.approve`. */
export type Permission = string;

/**
 * Where a grant applies: an org-tree node (covers everything beneath it) or a
 * single concrete resource (e.g. `project:X`).
 */
export type Scope =
  | { kind: 'org'; level: OrgLevel; id: Id }
  | { kind: 'resource'; resourceType: string; resourceId: Id };

/** A named bundle of permission patterns. Patterns may use `*` (a segment, or all). */
export interface Role {
  id: Id;
  name: string;
  permissions: Permission[];
}

export interface GrantAttributes {
  /** ABAC ceiling — the holder may act only up to this monetary amount. */
  approvalLimit?: number;
  [key: string]: unknown;
}

/** Binds a user to a role within a scope, with optional ABAC attributes. */
export interface Grant {
  userId: Id;
  roleId: Id;
  scope: Scope;
  attributes?: GrantAttributes;
}

/** The thing being acted on, with the org chain it belongs to. */
export interface AccessTarget {
  permission: Permission;
  /** Ancestor→self chain of org nodes the target sits under (tenant first). */
  orgPath: Array<{ level: OrgLevel; id: Id }>;
  /** Optional concrete resource being acted on. */
  resource?: { type: string; id: Id };
  /** Optional monetary amount, checked against a grant's `approvalLimit`. */
  amount?: number;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  matchedGrant?: Grant;
}

/** Does a role permission pattern match the requested permission? */
export function permissionMatches(pattern: Permission, requested: Permission): boolean {
  if (pattern === '*') return true;
  const p = pattern.split('.');
  const r = requested.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') {
      if (i === p.length - 1) return true; // trailing '*' matches all remaining segments
      continue; //                            a mid '*' matches exactly one segment
    }
    if (p[i] !== r[i]) return false;
  }
  return p.length === r.length;
}

/** Does a scope contain the target (i.e. the grant applies here)? */
export function scopeContains(scope: Scope, target: AccessTarget): boolean {
  if (scope.kind === 'org') {
    // The grant's org node must be the target's ancestor or self.
    return target.orgPath.some((n) => n.id === scope.id);
  }
  // resource scope: must match the concrete resource exactly.
  return target.resource?.type === scope.resourceType && target.resource?.id === scope.resourceId;
}

/**
 * Pure access evaluation. Allows iff some grant: (a) carries a role whose
 * permissions match, (b) whose scope contains the target, and (c) whose ABAC
 * attributes permit (`approvalLimit ≥ amount`). The first satisfying grant wins.
 * Framework-free so it is trivially testable and reusable on client + server.
 */
export function evaluateAccess(
  grants: Grant[],
  rolesById: Map<Id, Role>,
  target: AccessTarget,
): AccessDecision {
  for (const grant of grants) {
    const role = rolesById.get(grant.roleId);
    if (!role) continue;
    if (!role.permissions.some((p) => permissionMatches(p, target.permission))) continue;
    if (!scopeContains(grant.scope, target)) continue;
    if (
      grant.attributes?.approvalLimit !== undefined &&
      target.amount !== undefined &&
      target.amount > grant.attributes.approvalLimit
    ) {
      continue; // over the ABAC ceiling — this grant does not authorize it
    }
    return { allowed: true, reason: `granted by role "${role.name}"`, matchedGrant: grant };
  }
  return { allowed: false, reason: `no grant satisfies "${target.permission}"` };
}
