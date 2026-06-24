import { Injectable } from '@nestjs/common';
import {
  type AccessDecision,
  type AccessTarget,
  type Grant,
  type Id,
  type Role,
  evaluateAccess,
} from '@aura/shared';

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
    list.push(grant);
    this.grantsByUser.set(grant.userId, list);
  }

  can(userId: Id, target: AccessTarget): AccessDecision {
    return evaluateAccess(this.grantsByUser.get(userId) ?? [], this.roles, target);
  }

  /** Throwing variant for guard / service call-sites. */
  assert(userId: Id, target: AccessTarget): void {
    const decision = this.can(userId, target);
    if (!decision.allowed) {
      throw new Error(`Access denied: ${decision.reason}`);
    }
  }
}
