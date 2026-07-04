import { Body, Controller, Get, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import type { WorkspaceConfig, WorkspaceMe } from '@aura/shared';
import { WorkspaceConfigService, type WorkspaceUser } from './workspace-config.service';

/** Dev fallback identity when auth enforcement is off (actorId is null). */
const DEV_USER = 'u-admin';

/**
 * Workspace access API. The admin center reads/writes the whole config; every
 * user reads their own effective view (role + allowed functions) via /me.
 * Enforcement of *who* may PUT is the kernel RBAC's job (gated); this exposes
 * the configuration surface the UI needs.
 */
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceConfigService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('config')
  getConfig(): WorkspaceConfig {
    return this.workspace.get();
  }

  @Put('config')
  updateConfig(@Body() patch: Partial<WorkspaceConfig>): WorkspaceConfig {
    return this.workspace.update(patch ?? {});
  }

  @Get('me')
  me(): WorkspaceMe {
    const username = this.tenant.get().actorId ?? DEV_USER;
    return this.workspace.me(username);
  }

  @Get('users')
  users(): WorkspaceUser[] {
    return this.workspace.users();
  }
}
