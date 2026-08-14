import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AccessService, AuditService, Permissions, TenantContext, UsersService } from '@aura/core';
import type { Role, Scope } from '@aura/shared';

/**
 * Project Delivery — Membership (Project Delivery Workspace spec, slice P1).
 *
 * Project membership IS an access grant scoped to a single project:
 *   { userId, roleId, scope: { kind: 'resource', resourceType: 'project', resourceId } }
 * so there is NO separate membership store — the AccessService (roles/grants, the same the
 * global PermissionsGuard enforces) is the single source of truth, reused not forked.
 *
 * The team screen may assign ONLY delivery-plane roles. Enterprise roles (r-admin, r-finance, …)
 * are deliberately excluded so a project team can never escalate org-wide authority — a member is
 * a delivery manager INSIDE one project, nothing more.
 *
 * NOTE (P1 boundary): this establishes the membership DATA + UI. Enforcing that an actor may only
 * manage/see the projects they belong to is slice P2 (scope-aware PermissionsGuard). Until then,
 * `projects.member.manage` (held by r-pm / r-admin) authorises management on any project.
 */

const DELIVERY_ROLE_IDS = ['r-pm', 'r-site-engineer', 'r-qa-qc', 'r-hse'] as const;

function projectScope(projectId: string): Scope {
  return { kind: 'resource', resourceType: 'project', resourceId: projectId };
}

interface MemberView {
  userId: string;
  displayName: string;
  email: string;
  roleId: string;
  roleName: string;
}

@Controller('projects')
export class ProjectMembersController {
  constructor(
    private readonly access: AccessService,
    private readonly users: UsersService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  /** The delivery-role catalog + assignable active users for the add-member form. */
  @Permissions('projects.member.manage')
  @Get(':projectId/assignable')
  assignable(@Param('projectId') _projectId: string): {
    roles: Array<{ id: string; name: string }>;
    users: Array<{ userId: string; displayName: string; email: string }>;
  } {
    const { tenantId } = this.tenant.get();
    return {
      roles: this.deliveryRoles().map((r) => ({ id: r.id, name: r.name })),
      users: this.users
        .list(tenantId)
        .filter((u) => u.active)
        .map((u) => ({ userId: u.userId, displayName: u.displayName || u.userId, email: u.email })),
    };
  }

  @Permissions('projects.member.read')
  @Get(':projectId/members')
  list(@Param('projectId') projectId: string): MemberView[] {
    return this.membersOf(projectId);
  }

  @Permissions('projects.member.manage')
  @Post(':projectId/members')
  add(@Param('projectId') projectId: string, @Body() dto: { userId?: string; roleId?: string }): { ok: true; member: MemberView } {
    const userId = dto?.userId?.trim();
    const roleId = dto?.roleId?.trim();
    if (!userId) throw new BadRequestException('userId is required');
    if (!roleId) throw new BadRequestException('roleId is required');
    if (!DELIVERY_ROLE_IDS.includes(roleId as (typeof DELIVERY_ROLE_IDS)[number])) {
      throw new BadRequestException(`roleId must be a delivery role (${DELIVERY_ROLE_IDS.join(', ')})`);
    }
    const ctx = this.tenant.get();
    this.access.grant({ userId, roleId, scope: projectScope(projectId) });
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'projects', 'member', projectId, 'added', {
      userId,
      roleId,
    });
    const u = this.users.get(ctx.tenantId, userId);
    const roleName = this.access.listRoles().find((r) => r.id === roleId)?.name ?? roleId;
    return { ok: true, member: { userId, displayName: u?.displayName || userId, email: u?.email ?? '', roleId, roleName } };
  }

  @Permissions('projects.member.manage')
  @Delete(':projectId/members/:userId')
  remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Query('roleId') roleId?: string,
  ): { removed: boolean } {
    if (!roleId?.trim()) throw new BadRequestException('roleId query param is required');
    const ctx = this.tenant.get();
    const removed = this.access.revoke(userId, roleId.trim(), projectScope(projectId));
    if (removed) {
      void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'projects', 'member', projectId, 'removed', {
        userId,
        roleId,
      });
    }
    return { removed };
  }

  /** The whitelisted delivery roles, resolved against the live role registry (names stay in sync). */
  private deliveryRoles(): Role[] {
    const byId = new Map(this.access.listRoles().map((r) => [r.id, r]));
    return DELIVERY_ROLE_IDS.map((id) => byId.get(id)).filter((r): r is Role => Boolean(r));
  }

  /** Members of a project = grants scoped to `resource:project:<id>`, joined to user + role names. */
  private membersOf(projectId: string): MemberView[] {
    const { tenantId } = this.tenant.get();
    const roleName = new Map(this.access.listRoles().map((r) => [r.id, r.name]));
    return this.access
      .listGrants()
      .filter((g) => g.scope.kind === 'resource' && g.scope.resourceType === 'project' && g.scope.resourceId === projectId)
      .map((g) => {
        const u = this.users.get(tenantId, g.userId);
        return {
          userId: g.userId,
          displayName: u?.displayName || g.userId,
          email: u?.email ?? '',
          roleId: g.roleId,
          roleName: roleName.get(g.roleId) ?? g.roleId,
        };
      });
  }
}
