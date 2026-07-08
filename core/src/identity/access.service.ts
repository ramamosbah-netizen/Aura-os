import { Injectable } from '@nestjs/common';
import {
  type AccessDecision,
  type AccessTarget,
  type Grant,
  type Id,
  type Role,
  AccessDeniedError,
  evaluateAccess,
} from '@aura/shared';

/** Structural equality for a grant scope (used to de-dupe grants and target a revoke). */
function sameScope(a: Grant['scope'], b: Grant['scope']): boolean {
  if (a.kind === 'org' && b.kind === 'org') return a.level === b.level && a.id === b.id;
  if (a.kind === 'resource' && b.kind === 'resource') return a.resourceType === b.resourceType && a.resourceId === b.resourceId;
  return false;
}

/**
 * The single authorization entry point. Every module asks `can()` — no module
 * implements its own access logic. Phase 0b holds roles/grants in memory; the
 * production impl loads them from Postgres (cached per request).
 */
@Injectable()
export class AccessService {
  private readonly roles = new Map<Id, Role>();
  private readonly grantsByUser = new Map<Id, Grant[]>();

  registerRole(role: Role): void {
    this.roles.set(role.id, role);
  }

  grant(grant: Grant): void {
    const list = this.grantsByUser.get(grant.userId) ?? [];
    // De-dupe: same user+role+scope is idempotent (re-granting doesn't stack).
    const exists = list.some((g) => g.roleId === grant.roleId && sameScope(g.scope, grant.scope));
    if (!exists) list.push(grant);
    this.grantsByUser.set(grant.userId, list);
  }

  /** All registered roles (for the admin roles screen). */
  listRoles(): Role[] {
    return [...this.roles.values()];
  }

  /** All grants across users (for the admin access screen). */
  listGrants(): Grant[] {
    return [...this.grantsByUser.values()].flat();
  }

  /** Revoke a user's role grant (optionally within a specific scope). Returns true if removed. */
  revoke(userId: Id, roleId: Id, scope?: Grant['scope']): boolean {
    const list = this.grantsByUser.get(userId);
    if (!list) return false;
    const next = list.filter((g) => !(g.roleId === roleId && (!scope || sameScope(g.scope, scope))));
    this.grantsByUser.set(userId, next);
    return next.length < list.length;
  }

  can(userId: Id, target: AccessTarget): AccessDecision {
    return evaluateAccess(this.grantsByUser.get(userId) ?? [], this.roles, target);
  }

  /** Throwing variant for guard / service call-sites. */
  assert(userId: Id, target: AccessTarget): void {
    const decision = this.can(userId, target);
    if (!decision.allowed) {
      throw new AccessDeniedError(decision.reason);
    }
  }
}
