import { Body, Controller, Get, Put } from '@nestjs/common';
import { ModulesService, TenantContext, UsersService } from '@aura/core';
import type { WorkspaceConfig, WorkspaceMe } from '@aura/shared';
import { WorkspaceConfigService } from './workspace-config.service';

/** Dev fallback identity when auth enforcement is off (actorId is null). */
const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

/**
 * Workspace access API. The admin center reads/writes the whole config; every
 * user reads their own effective view (role + allowed functions) via /me,
 * resolved from the authenticated identity (the JWT `sub` → tenant actorId).
 * Enforcement of *who* may PUT is the kernel RBAC's job (gated); this exposes
 * the configuration surface the UI needs. Everything is tenant-scoped.
 */
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceConfigService,
    private readonly tenant: TenantContext,
    private readonly modules: ModulesService,
    private readonly usersDirectory: UsersService,
  ) {}

  /** Disabled business modules for this tenant — the sidebar hides them (Module Manager). */
  @Get('modules')
  moduleGates(): { disabled: string[] } {
    return { disabled: this.modules.disabledIds(this.tenant.get().tenantId) };
  }

  @Get('config')
  getConfig(): Promise<WorkspaceConfig> {
    return this.workspace.get(this.tenant.get().tenantId);
  }

  @Put('config')
  updateConfig(@Body() patch: Partial<WorkspaceConfig>): Promise<WorkspaceConfig> {
    return this.workspace.update(this.tenant.get().tenantId, patch ?? {});
  }

  @Get('me')
  me(): Promise<WorkspaceMe> {
    const ctx = this.tenant.get();
    // The authenticated user is the JWT subject (actorId); fall back only when
    // auth enforcement is off (dev/CI), so role follows real identity in prod.
    const username = ctx.actorId ?? DEV_USER;
    return this.workspace.me(ctx.tenantId, username);
  }

  @Get('users')
  async users(): Promise<Array<{ username: string; displayName: string; active: boolean; role: string | null; roleLabel: string; isAdmin: boolean }>> {
    const tenantId = this.tenant.get().tenantId;
    await this.usersDirectory.ensureTenant(tenantId);
    const [configured, registered] = await Promise.all([
      this.workspace.users(tenantId),
      Promise.resolve(this.usersDirectory.list(tenantId)),
    ]);
    const roleByUser = new Map(configured.map((user) => [user.username, user]));
    // Assignment pickers must use the enforceable user registry. Showing workspace-config names that
    // are not registered makes the UI offer assignees the API must reject, while hiding registered
    // users makes valid maker/checker workflows impossible to complete.
    return registered.map((user) => {
      const role = roleByUser.get(user.userId);
      return {
        username: user.userId,
        displayName: user.displayName,
        active: user.active,
        role: role?.role ?? null,
        roleLabel: role?.roleLabel ?? 'Registered user',
        isAdmin: role?.isAdmin ?? false,
      };
    });
  }
}
