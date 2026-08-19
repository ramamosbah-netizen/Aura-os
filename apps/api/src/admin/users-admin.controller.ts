import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AuditService, CredentialsService, Permissions, TenantContext, UsersService, type PlatformUser } from '@aura/core';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';

/**
 * Users admin (Vol 15 §2.2 — invite/deactivate/company assignment). The registry
 * (aura_users, migration 0137) is the source of truth for identity metadata + the
 * active flag; the workspace directory (role assignments) and access grants stay
 * their own screens — this list merges them so unregistered-but-assigned ids are
 * visible and one click registers them.
 */
@Controller('admin/users')
export class UsersAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly workspace: WorkspaceConfigService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
  ) {}

  private auditLog(entityId: string, action: string, payload: Record<string, unknown>): void {
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'user', entityId, action, payload);
  }

  @Permissions('admin.users.manage')
  @Get()
  async list(): Promise<{
    users: Array<PlatformUser & { workspaceRole: string | null; registered: boolean }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const registry = this.users.list(tenantId);
    const directory = await this.workspace.users(tenantId);
    const byId = new Map<string, PlatformUser & { workspaceRole: string | null; registered: boolean }>();
    for (const u of registry) {
      byId.set(u.userId, { ...u, workspaceRole: null, registered: true });
    }
    for (const d of directory) {
      const existing = byId.get(d.username);
      if (existing) {
        existing.workspaceRole = d.roleLabel;
      } else {
        // Assigned in the workspace but not registered yet — visible, one click to register.
        byId.set(d.username, {
          tenantId,
          userId: d.username,
          displayName: '',
          email: '',
          companyId: null,
          active: true,
          workspaceRole: d.roleLabel,
          registered: false,
        });
      }
    }
    return { users: [...byId.values()].sort((a, b) => a.userId.localeCompare(b.userId)) };
  }

  /** Create or update a user (register/invite). */
  @Permissions('admin.users.manage')
  @Post()
  upsert(
    @Body() dto: { userId?: string; displayName?: string; email?: string; companyId?: string | null },
  ): PlatformUser {
    const userId = dto?.userId?.trim();
    if (!userId) throw new BadRequestException('userId is required');
    if (!/^[a-z0-9][a-z0-9._@-]{1,63}$/i.test(userId)) {
      throw new BadRequestException('userId must be 2–64 chars: letters, digits, . _ @ -');
    }
    const user = this.users.save({
      tenantId: this.tenant.get().tenantId,
      userId,
      displayName: dto.displayName?.trim(),
      email: dto.email?.trim(),
      companyId: dto.companyId === undefined ? undefined : dto.companyId,
    });
    this.auditLog(userId, 'upserted', { displayName: user.displayName, email: user.email, companyId: user.companyId });
    return user;
  }

  /** Deactivate / reactivate — enforced at login and on every guarded request. */
  @Permissions('admin.users.manage')
  @Post(':id/active')
  setActive(@Param('id') id: string, @Body() dto: { active?: boolean }): PlatformUser {
    const ctx = this.tenant.get();
    const active = dto?.active !== false;
    if (!active && ctx.actorId === id) {
      throw new BadRequestException('you cannot deactivate your own account');
    }
    const user = this.users.setActive(ctx.tenantId, id, active);
    if (!user) throw new NotFoundException(`user ${id} is not registered`);
    this.auditLog(id, active ? 'reactivated' : 'deactivated', {});
    return user;
  }

  @Permissions('admin.users.manage')
  @Delete(':id')
  remove(@Param('id') id: string): { removed: boolean } {
    const removed = this.users.remove(this.tenant.get().tenantId, id);
    if (removed) this.auditLog(id, 'removed', {});
    return { removed };
  }

  /**
   * Set (or reset) another account's password — the onboarding step S1 left with no route.
   *
   * After the credential rebuild, sign-in requires a REGISTERED identity with a REAL credential,
   * and the only thing that could mint one was the dev bootstrap (`AUTH_DEV_PASSWORD`, dev-only,
   * for named accounts). So an administrator could invite a user through `POST /admin/users` and
   * then had no way to let them in — the seeder's own warning already pointed here, at a route
   * that did not exist.
   *
   * `mustChange` defaults to TRUE: a password another person chose is a handover secret, not the
   * user's password, so the next sign-in returns the `password_change` challenge instead of a
   * session. Callers that genuinely want a directly-usable credential (test fixtures) opt out.
   */
  @Permissions('admin.users.manage')
  @Post(':id/password')
  async setPassword(
    @Param('id') id: string,
    @Body() dto: { password?: string; mustChange?: boolean },
  ): Promise<{ userId: string; mustChange: boolean }> {
    const tenantId = this.tenant.get().tenantId;
    const user = this.users.get(tenantId, id);
    if (!user) throw new NotFoundException(`user ${id} is not registered`);
    const password = dto?.password ?? '';
    const mustChange = dto?.mustChange !== false;
    try {
      await this.credentials.setPassword(tenantId, id, password, { mustChange });
    } catch (err) {
      // The service throws the policy reason ("password must be at least N characters"), which
      // is a client mistake, not a server fault.
      throw new BadRequestException((err as Error).message);
    }
    // NEVER the password, not even its length — an audit trail is read by more people than the
    // admin screen is.
    this.auditLog(id, 'password.set', { mustChange, byAdmin: true });
    return { userId: id, mustChange };
  }
}
