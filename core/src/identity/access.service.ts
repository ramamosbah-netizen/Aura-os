import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  type AccessDecision,
  type AccessTarget,
  type Grant,
  type Id,
  type Role,
  AccessDeniedError,
  evaluateAccess,
} from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';

/** Structural equality for a grant scope (used to de-dupe grants and target a revoke). */
function sameScope(a: Grant['scope'], b: Grant['scope']): boolean {
  if (a.kind === 'org' && b.kind === 'org') return a.level === b.level && a.id === b.id;
  if (a.kind === 'resource' && b.kind === 'resource') return a.resourceType === b.resourceType && a.resourceId === b.resourceId;
  return false;
}

/** Stable string key for a scope — the PG primary-key component for a grant. */
function scopeKey(s: Grant['scope']): string {
  return s.kind === 'org' ? `org:${s.level}:${s.id}` : `resource:${s.resourceType}:${s.resourceId}`;
}

/**
 * The single authorization entry point. Every module asks `can()` — no module
 * implements its own access logic. Decisions stay in-memory (the hot path is
 * synchronous); when Postgres is configured, roles/grants write-through to
 * `aura_access_roles` / `aura_access_grants` and hydrate back on boot, so admin
 * edits survive restarts (gap #12 remainder / #7 DB-backed grants).
 */
@Injectable()
export class AccessService implements OnModuleInit {
  private readonly logger = new Logger('AccessService');
  private readonly roles = new Map<Id, Role>();
  private readonly grantsByUser = new Map<Id, Grant[]>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  /** Load persisted roles/grants into memory (PG mode). Idempotent; runs once on boot. */
  async onModuleInit(): Promise<void> {
    await this.hydrate();
    this.seedStandardRoles();
    this.seedDevAdminGrant();
  }

  /**
   * DEV-ONLY: grant the dev actor the `r-admin` role so an authenticated session can actually do
   * anything.
   *
   * Roles are seeded on every boot but **grants only hydrate from Postgres**, so an in-memory boot
   * has zero grants — turning auth on there makes `PermissionsGuard` refuse every route, which is
   * precisely what blocked the authenticated browser suite (audit G-03). This closes that, and
   * nothing else: it is the stand-in for the real grant administration that a deployed tenant does
   * through `/admin`.
   *
   * Three independent conditions must all hold, so this cannot drift into production:
   *   1. `AUTH_SEED_DEV_ADMIN=true` — explicit opt-in, never a default
   *   2. `NODE_ENV !== 'production'` — refused outright, and loudly, if it is
   *   3. no `DATABASE_URL` — a real database carries real grants; never touch them
   */
  seedDevAdminGrant(): void {
    if (process.env.AUTH_SEED_DEV_ADMIN?.trim() !== 'true') return;

    if (process.env.NODE_ENV === 'production') {
      // Refuse rather than silently ignore: an operator who set this in prod has a wrong mental
      // model of the deployment and needs to see it.
      this.logger.error(
        'AUTH_SEED_DEV_ADMIN is set in production and was REFUSED. Grant administration belongs in /admin; remove this variable.',
      );
      return;
    }

    if (this.pool) {
      this.logger.warn(
        'AUTH_SEED_DEV_ADMIN ignored: a database is configured, so grants come from aura_access_grants.',
      );
      return;
    }

    // Comma-separated, because a single principal cannot exercise segregation of duties: the
    // permit-to-work gate refuses self-authorisation, so proving it end to end needs a second
    // actor to request what the first one approves.
    const userIds = (process.env.AUTH_DEV_ADMIN_USER?.trim() || 'u-admin')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const tenantId = process.env.AUTH_DEV_ADMIN_TENANT?.trim() || 'dev-tenant';
    for (const userId of userIds) {
      this.addGrantInMemory({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: tenantId } });
    }
    this.logger.warn(
      `DEV ONLY — granted [${userIds.join(', ')}] the r-admin role on tenant '${tenantId}' (in-memory boot, AUTH_SEED_DEV_ADMIN=true).`,
    );
  }

  /** Seed default enterprise roles across all 19 ELV business modules if not registered. */
  seedStandardRoles(): void {
    // Communication is a baseline capability, not a departmental one: every staffed role needs
    // chat and internal mail. The permission guard DERIVES `comms.*` from the /comms routes, so
    // before this line every standard role was already refused chat and mail the moment auth was
    // switched on — only the wildcard admin roles worked. Granting it back repairs that rather
    // than widening anything.
    const COMMS = 'comms.*';
    const DEFAULT_ROLES: Role[] = [
      { id: 'r-admin', name: 'System Administrator', permissions: ['*'] },
      {
        id: 'r-sales',
        name: 'Sales Representative',
        permissions: ['crm.lead.*', 'crm.opportunity.*', 'crm.quotation.create', 'crm.quotation.read', 'crm.quotation.update', 'crm.activity.*', COMMS],
      },
      {
        id: 'r-sales-manager',
        name: 'Sales Manager',
        permissions: ['crm.*', 'tendering.*', 'contracts.contract.read', COMMS],
      },
      {
        id: 'r-pm',
        name: 'Project Manager',
        permissions: ['projects.*', 'contracts.ipc.create', 'contracts.contract.read', 'site.read', 'quality.read', 'doccontrol.read', COMMS],
      },
      {
        id: 'r-site-engineer',
        name: 'Site Engineer',
        permissions: ['site.*', 'quality.inspection-request.create', 'quality.read', 'hse.read', 'engineering.read', COMMS],
      },
      {
        id: 'r-qa-qc',
        name: 'QA/QC Inspector',
        permissions: ['quality.*', 'commissioning.*', 'site.read', 'engineering.read', COMMS],
      },
      {
        id: 'r-hse',
        name: 'HSE Officer',
        permissions: ['hse.*', 'site.read', COMMS],
      },
      {
        id: 'r-procurement',
        name: 'Procurement Specialist',
        permissions: ['procurement.*', 'inventory.read', 'suppliers.*', COMMS],
      },
      {
        id: 'r-store',
        name: 'Store Keeper',
        permissions: ['inventory.*', 'procurement.po.read', COMMS],
      },
      {
        id: 'r-finance',
        name: 'Finance Controller',
        permissions: ['finance.*', 'contracts.ipc.certify', 'procurement.po.read', 'hr.expense-claims.approve', COMMS],
      },
    ];

    for (const r of DEFAULT_ROLES) {
      if (!this.roles.has(r.id)) {
        this.registerRole(r);
      }
    }
  }

  async hydrate(): Promise<void> {
    if (!this.pool) return;
    try {
      const roleRows = await this.pool.query<{ id: string; name: string; permissions: string[] }>(
        `SELECT id, name, permissions FROM public.aura_access_roles`,
      );
      for (const r of roleRows.rows) {
        this.roles.set(r.id, { id: r.id, name: r.name, permissions: r.permissions ?? [] });
      }
      const grantRows = await this.pool.query<{ user_id: string; role_id: string; scope: Grant['scope']; attributes: Grant['attributes'] | null }>(
        `SELECT user_id, role_id, scope, attributes FROM public.aura_access_grants`,
      );
      for (const g of grantRows.rows) {
        this.addGrantInMemory({ userId: g.user_id, roleId: g.role_id, scope: g.scope, attributes: g.attributes ?? undefined });
      }
      if (roleRows.rows.length || grantRows.rows.length) {
        this.logger.log(`Hydrated ${roleRows.rows.length} role(s) + ${grantRows.rows.length} grant(s) from Postgres`);
      }
    } catch (err) {
      this.logger.error(`Access hydrate failed: ${(err as Error).message}`);
    }
  }

  registerRole(role: Role): void {
    this.roles.set(role.id, role);
    if (this.pool) {
      void this.pool
        .query(
          `INSERT INTO public.aura_access_roles (id, name, permissions, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, permissions = excluded.permissions, updated_at = now()`,
          [role.id, role.name, JSON.stringify(role.permissions)],
        )
        .catch((err) => this.logger.error(`persist role ${role.id} failed: ${(err as Error).message}`));
    }
  }

  grant(grant: Grant): void {
    const added = this.addGrantInMemory(grant);
    if (added && this.pool) {
      void this.pool
        .query(
          `INSERT INTO public.aura_access_grants (user_id, role_id, scope_key, scope, attributes, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (user_id, role_id, scope_key) DO UPDATE SET scope = excluded.scope, attributes = excluded.attributes, updated_at = now()`,
          [grant.userId, grant.roleId, scopeKey(grant.scope), JSON.stringify(grant.scope), grant.attributes ? JSON.stringify(grant.attributes) : null],
        )
        .catch((err) => this.logger.error(`persist grant ${grant.userId}→${grant.roleId} failed: ${(err as Error).message}`));
    }
  }

  /** De-duped in-memory insert; returns whether the grant was new. */
  private addGrantInMemory(grant: Grant): boolean {
    const list = this.grantsByUser.get(grant.userId) ?? [];
    const exists = list.some((g) => g.roleId === grant.roleId && sameScope(g.scope, grant.scope));
    if (!exists) list.push(grant);
    this.grantsByUser.set(grant.userId, list);
    return !exists;
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
    const removed = next.length < list.length;
    if (removed && this.pool) {
      const params: unknown[] = [userId, roleId];
      let sql = `DELETE FROM public.aura_access_grants WHERE user_id = $1 AND role_id = $2`;
      if (scope) {
        params.push(scopeKey(scope));
        sql += ` AND scope_key = $3`;
      }
      void this.pool
        .query(sql, params)
        .catch((err) => this.logger.error(`revoke grant ${userId}→${roleId} failed: ${(err as Error).message}`));
    }
    return removed;
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

  /**
   * Value-threshold authorisation for an amount-bearing action (e.g. approving a quotation/contract/
   * IPC/invoice). Passes when a grant both permits the action AND carries enough `approvalLimit` for
   * `target.amount`. When the user *could* do the action but their approval limit is too low, throws a
   * clear "above your approval limit" message (rather than the generic no-grant reason) so the money
   * cycle can distinguish an authority ceiling from a missing permission. Reuses the existing ABAC.
   */
  assertApprovalAuthority(userId: Id, target: AccessTarget & { amount: number }, label = 'this action'): void {
    if (this.can(userId, target).allowed) return;
    // Would it pass without the amount? Then it's an approval-limit ceiling, not a missing permission.
    const { amount: _amount, ...withoutAmount } = target;
    if (this.can(userId, withoutAmount).allowed) {
      throw new AccessDeniedError(`${label} of ${target.amount} is above your approval limit — a more senior approver is required`);
    }
    throw new AccessDeniedError(this.can(userId, target).reason);
  }
}
