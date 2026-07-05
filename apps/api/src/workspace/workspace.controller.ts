import { Body, Controller, Get, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import type { WorkspaceConfig, WorkspaceMe } from '@aura/shared';
import { WorkspaceConfigService, type WorkspaceUser } from './workspace-config.service';

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
  ) {}

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
  users(): Promise<WorkspaceUser[]> {
    return this.workspace.users(this.tenant.get().tenantId);
  }
}
